import { expect, type Page } from '@playwright/test';
import {
  accountTypesMatch,
  describeAccountSelectOptions,
  hasAccountTargetConfig,
  mergeAccountSelectOptions,
  targetRequiresStableApiIdentifiers,
  type AccountSelectOptions,
  type ResolvedAccountSelectOptions,
} from '../../config/accountContext';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import {
  assertExpectedAccountInApiCapture,
  attachAccountContextCapture,
  findMatchingApiRecords,
  getAccountContextCapture,
  waitForAccountApiRecords,
  type AccountApiRecord,
  type AccountContextApiCapture,
} from './accountContextApi';
import { pathnameLooksLikeAccountDashboardPath } from './accountRoutes';
import { gotoWithRetry } from './navigation';
import { waitForDashboardReadiness } from './dashboardReadiness';

function getOrAttachCapture(page: Page): AccountContextApiCapture {
  return getAccountContextCapture(page) ?? attachAccountContextCapture(page);
}

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

export type SelectAccountResult = {
  options: ResolvedAccountSelectOptions;
  selectedLabel?: string;
  matchedApiRecord?: AccountApiRecord;
};

async function readCardLabel(page: Page, options: ResolvedAccountSelectOptions): Promise<string | undefined> {
  const picker = new SelectAccountPage(page);
  if (options.accountName) {
    const loose = await picker.cardByLooseName(options.accountName);
    if (loose) {
      return (await loose.innerText().catch(() => ''))?.trim().slice(0, 120) || options.accountName;
    }
  }
  if (options.accountId) {
    const card = picker.cardByTestId(options.accountId);
    if (await card.isVisible().catch(() => false)) {
      return (await card.innerText().catch(() => ''))?.trim().slice(0, 120);
    }
  }
  return options.accountName;
}

async function clickMatchingCard(
  page: Page,
  picker: SelectAccountPage,
  options: ResolvedAccountSelectOptions,
  capture: AccountContextApiCapture
): Promise<void> {
  const shouldValidateApi =
    targetRequiresStableApiIdentifiers(options) ||
    hasAccountTargetConfig(options) ||
    Boolean(options.accountType);

  if (shouldValidateApi) {
    await waitForAccountApiRecords(capture);
    const records = capture.allRecords();
    if (records.length > 0) {
      assertExpectedAccountInApiCapture(capture, options);
    } else if (targetRequiresStableApiIdentifiers(options)) {
      throw new Error(
        `[account-api] Expected stable id in /profile or /contexts but no accounts were parsed. ` +
          `Target: ${describeAccountSelectOptions(options)}. Check API_URL and login session.`
      );
    }
  }

  if (options.accountContextId) {
    const byCtx = picker.cardByContextTestId(options.accountContextId);
    if (await byCtx.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await byCtx.click();
      return;
    }
  }

  if (options.accountId) {
    const byId = picker.cardByTestId(options.accountId);
    if (await byId.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await byId.click();
      return;
    }
    if (options.accountContextId || options.accountName) {
      /* fall through to name */
    } else {
      throw new Error(
        `[select-account] No picker row with data-testid for account id "${options.accountId}". ` +
          `Add select-account-option-${options.accountId} in the app or set E2E_* account name env.`
      );
    }
  }

  if (options.accountName) {
    const loose = await picker.cardByLooseName(options.accountName);
    if (loose) {
      await loose.click();
      return;
    }
    const byName = picker.cardByNameSubstring(options.accountName);
    if (await byName.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await byName.click();
      return;
    }
    const visible = await picker.countVisibleAccountCards();
    throw new Error(
      `[select-account] No account card matching name "${options.accountName}" (${visible} card(s) visible). ` +
        `API/UI name may differ — prefer E2E_*_ACCOUNT_CONTEXT_ID or E2E_*_ACCOUNT_ID. Options: ${describeAccountSelectOptions(options)}`
    );
  }

  if (options.preferLastUsed) {
    const last = picker.lastUsedCard();
    if (await last.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await last.click();
      return;
    }
    throw new Error('[select-account] preferLastUsed=true but no LAST USED card found.');
  }

  if (options.accountType === 'freelance') {
    const count = await picker.freelanceCards().count();
    if (count === 0) {
      throw new Error(
        '[select-account] Expected a Freelancer account card but none found. Set E2E_FREELANCE_ACCOUNT_NAME or E2E_FREELANCE_ACCOUNT_ID.'
      );
    }
    if (count > 1) {
      throw new Error(
        `[select-account] ${count} Freelancer cards — set E2E_FREELANCE_ACCOUNT_NAME or E2E_FREELANCE_ACCOUNT_ID (do not assume order).`
      );
    }
    await picker.freelanceCards().first().click();
    return;
  }

  if (options.accountType === 'business') {
    const count = await picker.businessCards().count();
    if (count === 0) {
      throw new Error(
        '[select-account] Expected a Business account card but none found. Set E2E_BUSINESS_ACCOUNT_NAME or E2E_BUSINESS_ACCOUNT_ID.'
      );
    }
    if (count > 1) {
      throw new Error(
        `[select-account] ${count} Business cards — set E2E_BUSINESS_ACCOUNT_NAME or E2E_BUSINESS_ACCOUNT_ID (do not assume order).`
      );
    }
    await picker.businessCards().first().click();
    return;
  }

  const count = await picker.countVisibleAccountCards();
  if (count === 0) {
    throw new Error(
      '[select-account] No account cards on picker. Configure E2E_SELECT_ACCOUNT_NAME, E2E_SELECT_ACCOUNT_TYPE, or E2E_DEFAULT_ACCOUNT_ID.'
    );
  }
  if (count > 1) {
    throw new Error(
      `[select-account] ${count} accounts visible but no selection criteria. ` +
        `Set E2E_* account name, id, or context id — do not rely on list order.`
    );
  }
  await picker.accountCards().first().click();
}

/**
 * Picks an account on `/select-account` and clicks **Continue**. Does not perform login.
 */
export async function selectAccountOnPicker(
  page: Page,
  explicitOptions?: AccountSelectOptions
): Promise<SelectAccountResult> {
  const options = mergeAccountSelectOptions(explicitOptions);
  const picker = new SelectAccountPage(page);
  attachAccountContextCapture(page);
  const capture = getOrAttachCapture(page);

  if (!picker.isOnSelectAccountPath() && !(await picker.pickerHeading().isVisible().catch(() => false))) {
    return { options, selectedLabel: await readCardLabel(page, options) };
  }

  await picker.assertPickerShellVisible();

  const matches = hasAccountTargetConfig(options) ? findMatchingApiRecords(capture.allRecords(), options) : [];
  const matchedApiRecord = matches[0];

  await clickMatchingCard(page, picker, options, capture);
  await picker.clickContinue();
  await picker.waitForLeftSelectAccount();

  if (!pathnameLooksLikeAccountDashboardPath(getPathname(page))) {
    throw new Error(
      `[select-account] Continue did not reach /account (url=${page.url()}). Options: ${describeAccountSelectOptions(options)}`
    );
  }

  const selectedLabel = await readCardLabel(page, options);
  return { options, selectedLabel, matchedApiRecord };
}

export async function resolveSelectAccountToDashboardIfNeeded(
  page: Page,
  explicitOptions?: AccountSelectOptions
): Promise<SelectAccountResult | undefined> {
  const path = getPathname(page);
  if (!/^\/select-account(\/|$)/i.test(path)) {
    if (pathnameLooksLikeAccountDashboardPath(path)) {
      return { options: mergeAccountSelectOptions(explicitOptions) };
    }
    await gotoWithRetry(page, '/account', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const after = getPathname(page);
    if (pathnameLooksLikeAccountDashboardPath(after)) {
      return { options: mergeAccountSelectOptions(explicitOptions) };
    }
    if (!/^\/select-account(\/|$)/i.test(after)) {
      return undefined;
    }
  }

  return selectAccountOnPicker(page, explicitOptions);
}

export async function assertActiveAccountContext(
  page: Page,
  result: SelectAccountResult
): Promise<void> {
  await waitForDashboardReadiness(page);

  const capture = getOrAttachCapture(page);
  const apiRecord = result.matchedApiRecord ?? findMatchingApiRecords(capture.allRecords(), result.options)[0];

  if (apiRecord?.accountContextId && result.options.accountContextId) {
    expect(apiRecord.accountContextId).toBe(result.options.accountContextId);
  }
  if (apiRecord?.businessId && result.options.businessId) {
    expect(apiRecord.businessId).toBe(result.options.businessId);
  }
  if (apiRecord?.type && result.options.accountType) {
    expect(accountTypesMatch(result.options.accountType, apiRecord.type)).toBe(true);
  }

  const nameHint = result.options.accountName ?? result.selectedLabel;
  if (nameHint) {
    const words = nameHint.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length >= 2) {
      const re = new RegExp(
        words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'),
        'i'
      );
      await expect(page.locator('body')).toContainText(re, { timeout: 20_000 });
    } else if (words[0]?.length >= 3) {
      const re = new RegExp(words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      await expect(page.locator('body')).toContainText(re, { timeout: 20_000 });
    }
  }
}
