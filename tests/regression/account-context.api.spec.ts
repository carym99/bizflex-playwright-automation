/**
 * Account context API — profile + contexts happy paths (70% pyramid layer).
 *
 * PR gate: only the profile test is tagged @api-auth (single product API signal).
 * Nightly regression lane: full describe via @regression.
 */
import { test, expect } from '@playwright/test';
import { loginForAccessToken } from '../../helpers/apiAuth';
import { fetchAccountApiSnapshot } from '../../helpers/accountContextClient';
import {
  businessEnvSkipReason,
  freelanceEnvSkipReason,
  resolveBusinessAccountContextFromEnv,
  resolveFreelanceAccountContextFromEnv,
} from '../../config/accountContext';
import {
  findMatchingApiRecords,
  formatAvailableAccountsForError,
} from '../../support/ui/accountContextApi';

test.describe('@regression @api-auth Account context API (PR)', () => {
  test('GET profile returns 200 and parses linked accounts', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const snap = await fetchAccountApiSnapshot(request, token);

    expect(snap.profileStatus, 'Profile should be authorized').toBe(200);
    expect(
      snap.allRecords.length,
      `Expected at least one account in profile/contexts. Available:\n${formatAvailableAccountsForError(snap.allRecords)}`
    ).toBeGreaterThan(0);
  });
});

test.describe('@regression Account context API (nightly)', () => {
  test('GET contexts returns 200 when endpoint is available', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const snap = await fetchAccountApiSnapshot(request, token);

    test.skip(
      snap.contextsStatus === 404,
      `Contexts endpoint not found (tried ${process.env.ACCOUNT_CONTEXTS_PATH || 'default paths'}). Set ACCOUNT_CONTEXTS_PATH.`
    );
    expect(snap.contextsStatus, 'Contexts should load for multi-workspace users').toBe(200);
    expect(snap.contextsRecords.length).toBeGreaterThan(0);
  });

  test('configured freelance account exists in profile or contexts', async ({ request }) => {
    const skip = freelanceEnvSkipReason();
    test.skip(!!skip, skip ?? '');

    const token = await loginForAccessToken(request);
    const target = resolveFreelanceAccountContextFromEnv();
    const snap = await fetchAccountApiSnapshot(request, token);
    expect(snap.profileStatus).toBe(200);

    const matches = findMatchingApiRecords(snap.allRecords, { ...target, accountType: 'freelance' });
    expect(
      matches.length,
      `Freelance target not in API data.\n${formatAvailableAccountsForError(snap.allRecords)}`
    ).toBeGreaterThan(0);
  });

  test('configured business account exists in profile or contexts', async ({ request }) => {
    const skip = businessEnvSkipReason('default');
    test.skip(!!skip, skip ?? '');

    const token = await loginForAccessToken(request);
    const target = resolveBusinessAccountContextFromEnv('default');
    const snap = await fetchAccountApiSnapshot(request, token);
    expect(snap.profileStatus).toBe(200);

    const matches = findMatchingApiRecords(snap.allRecords, { ...target, accountType: 'business' });
    expect(
      matches.length,
      `Business target not in API data.\n${formatAvailableAccountsForError(snap.allRecords)}`
    ).toBeGreaterThan(0);
  });
});
