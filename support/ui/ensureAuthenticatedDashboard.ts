import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  mergeAccountSelectOptions,
  describeAccountSelectOptions,
  type AccountSelectOptions,
} from '../../config/accountContext';
import {
  getBearerTokenFromPage,
  isAuthenticated,
  mirrorSessionUserTokensToLocalStorage,
} from '../auth/browserAuthSession';
import {
  attachAccountContextCapture,
  formatAvailableAccountsForError,
  getAccountContextCapture,
} from './accountContextApi';
import { logAuthDiagnostics } from '../auth/debugAuthState';
import {
  pathnameLooksLikeAccountDashboardPath,
  pathnameLooksLikeSelectAccountPath,
} from './accountRoutes';
import { installAuthSessionSeedInitScript } from './prepareAuthenticatedPage';
import { gotoWithRetry } from './navigation';
import { resolveSelectAccountToDashboardIfNeeded } from './selectAccount';
import { isDashboardShellVisible } from './dashboardReadiness';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import { resolveApiUrl } from '../../utils/api';

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

async function probeProfileStatus(page: Page): Promise<number | 'error'> {
  try {
    const token = await getBearerTokenFromPage(page);
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await page.request.get(
      resolveApiUrl(process.env.AUTH_BROWSER_VALIDATE_PATH || '/v1/users/profile'),
      { headers, failOnStatusCode: false }
    );
    return res.status();
  } catch {
    return 'error';
  }
}

export async function buildAuthenticatedSetupDiagnostics(
  page: Page,
  accountOptions?: AccountSelectOptions
): Promise<string> {
  const path = getPathname(page);
  const profileStatus = await probeProfileStatus(page);
  const token = await getBearerTokenFromPage(page).catch(() => null);
  const picker = new SelectAccountPage(page);
  const pickerVisible = await picker.pickerHeading().isVisible().catch(() => false);
  const dashboardShell = await isDashboardShellVisible(page).catch(() => false);
  const capture = getAccountContextCapture(page);
  const contexts =
    capture && capture.allRecords().length > 0
      ? formatAvailableAccountsForError(capture.allRecords())
      : '(no /profile or /contexts captured yet)';

  return [
    `url=${page.url()}`,
    `pathname=${path}`,
    `onSelectAccount=${pathnameLooksLikeSelectAccountPath(path)}`,
    `onAccountDashboard=${pathnameLooksLikeAccountDashboardPath(path)}`,
    `profileHttp=${profileStatus}`,
    `bearerInStorage=${Boolean(token && token.length >= 10)}`,
    `pickerHeadingVisible=${pickerVisible}`,
    `dashboardShellVisible=${dashboardShell}`,
    `accountTarget=${describeAccountSelectOptions(mergeAccountSelectOptions(accountOptions))}`,
    `availableContexts=${contexts}`,
  ].join('\n  ');
}

/**
 * Storage → /account (or /select-account) → pick env account → dashboard ready.
 * Call before strict URL/token assertions in fixtures.
 */
export async function ensureAuthenticatedDashboardPage(
  page: Page,
  testInfo: TestInfo | undefined,
  accountOptions?: AccountSelectOptions
): Promise<void> {
  const opts = mergeAccountSelectOptions(accountOptions);
  await installAuthSessionSeedInitScript(page);
  attachAccountContextCapture(page);

  const navTimeout = process.env.CI ? 120_000 : 90_000;
  await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded', timeout: navTimeout });
  await page.waitForLoadState('domcontentloaded').catch(() => {});

  if (/^\/login(\/|$)/.test(getPathname(page))) {
    const diag = await buildAuthenticatedSetupDiagnostics(page, opts);
    throw new Error(
      `[account-fixture] Session expired — on /login after opening /account. Run npm run auth.\n  ${diag}`
    );
  }

  const path = getPathname(page);
  if (pathnameLooksLikeSelectAccountPath(path) || pathnameLooksLikeAccountDashboardPath(path)) {
    await resolveSelectAccountToDashboardIfNeeded(page, opts);
  } else if (!/^\/login(\/|$)/.test(path)) {
    await resolveSelectAccountToDashboardIfNeeded(page, opts);
  }

  try {
    await expect
      .poll(
        async () => {
          const p = getPathname(page);
          if (pathnameLooksLikeAccountDashboardPath(p)) return true;
          if (await isDashboardShellVisible(page)) return true;
          return false;
        },
        {
          timeout: process.env.CI ? 90_000 : 60_000,
          intervals: [300, 500, 1_000, 2_000],
        }
      )
      .toBe(true);
  } catch (err) {
    if (testInfo) {
      await logAuthDiagnostics(page, 'ensureAuthenticatedDashboardPage');
    }
    const diag = await buildAuthenticatedSetupDiagnostics(page, opts);
    throw new Error(
      `${err instanceof Error ? err.message : String(err)}\n${diag}`
    );
  }

  await mirrorSessionUserTokensToLocalStorage(page).catch(() => {});

  const profileOk = (await probeProfileStatus(page)) === 200;
  const tokenOk = Boolean(await getBearerTokenFromPage(page));
  const shellOk = await isDashboardShellVisible(page);

  if (!profileOk && !tokenOk && !shellOk) {
    const diag = await buildAuthenticatedSetupDiagnostics(page, opts);
    throw new Error(`Session not verified after account setup.\n  ${diag}`);
  }

  if (!(await isAuthenticated(page)) && shellOk && pathnameLooksLikeAccountDashboardPath(getPathname(page))) {
    return;
  }

  if (!(await isAuthenticated(page)) && !shellOk) {
    const diag = await buildAuthenticatedSetupDiagnostics(page, opts);
    throw new Error(`Profile probe failed and dashboard shell not visible.\n  ${diag}`);
  }
}
