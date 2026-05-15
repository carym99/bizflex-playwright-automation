import { expect, type Page } from '@playwright/test';
import {
  describeAccountSelectOptions,
  mergeAccountSelectOptions,
  type AccountSelectOptions,
  type ResolvedAccountSelectOptions,
} from '../../config/accountContext';
import { SelectAccountPage } from '../../pages/SelectAccountPage';
import { pathnameLooksLikeAccountDashboardPath } from './accountRoutes';
import { gotoWithRetry } from './navigation';
import { waitForDashboardReadiness } from './dashboardReadiness';

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

export type SelectAccountResult = {
  options: ResolvedAccountSelectOptions;
  /** Best-effort label read from the picked card after selection. */
  selectedLabel?: string;
};

async function readCardLabel(page: Page, options: ResolvedAccountSelectOptions): Promise<string | undefined> {
  const picker = new SelectAccountPage(page);
  if (options.accountName) {
    const card = picker.cardByNameSubstring(options.accountName);
    if (await card.isVisible().catch(() => false)) {
      return (await card.innerText().catch(() => ''))?.trim().slice(0, 120) || options.accountName;
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

/**
 * Picks an account on `/select-account` and clicks **Continue**. Does not perform login.
 */
export async function selectAccountOnPicker(
  page: Page,
  explicitOptions?: AccountSelectOptions
): Promise<SelectAccountResult> {
  const options = mergeAccountSelectOptions(explicitOptions);
  const picker = new SelectAccountPage(page);

  if (!picker.isOnSelectAccountPath()) {
    return { options, selectedLabel: await readCardLabel(page, options) };
  }

  await picker.assertOnSelectAccountScreen();

  if (options.accountId) {
    const byId = picker.cardByTestId(options.accountId);
    if (await byId.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await byId.click();
    } else {
      throw new Error(
        `[select-account] No picker row with data-testid for account id "${options.accountId}". ` +
          `Add select-account-option-${options.accountId} in the app or set E2E_* account name env.`
      );
    }
  } else if (options.accountName) {
    const byName = picker.cardByNameSubstring(options.accountName);
    if (await byName.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await byName.click();
    } else {
      const visible = await picker.accountCards().count();
      throw new Error(
        `[select-account] No account card matching name "${options.accountName}" (${visible} card(s) visible). ` +
          `Required QA account missing? Options: ${describeAccountSelectOptions(options)}`
      );
    }
  } else if (options.preferLastUsed) {
    const last = picker.lastUsedCard();
    if (await last.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await last.click();
    } else {
      throw new Error('[select-account] preferLastUsed=true but no LAST USED card found.');
    }
  } else if (options.accountType === 'freelance') {
    const card = picker.freelanceCards().first();
    if (await card.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await card.click();
    } else {
      throw new Error(
        '[select-account] Expected a Freelancer account card but none found. Set E2E_FREELANCE_ACCOUNT_NAME or create QA freelance account.'
      );
    }
  } else if (options.accountType === 'business') {
    const card = picker.businessCards().first();
    if (await card.isVisible({ timeout: 12_000 }).catch(() => false)) {
      await card.click();
    } else {
      throw new Error(
        '[select-account] Expected a Business account card but none found. Set E2E_BUSINESS_ACCOUNT_NAME or create QA business account.'
      );
    }
  } else {
    const count = await picker.countVisibleAccountCards();
    if (count === 0) {
      throw new Error(
        '[select-account] No account cards on picker. Configure E2E_SELECT_ACCOUNT_NAME, E2E_SELECT_ACCOUNT_TYPE, or E2E_DEFAULT_ACCOUNT_ID.'
      );
    }
    if (count > 1) {
      throw new Error(
        `[select-account] ${count} accounts visible but no selection criteria. ` +
          `Set E2E_SELECT_ACCOUNT_NAME or E2E_SELECT_ACCOUNT_TYPE (freelance|business) — do not rely on list order.`
      );
    }
    await picker.accountCards().first().click();
  }

  await picker.clickContinue();
  await picker.waitForLeftSelectAccount();

  if (!pathnameLooksLikeAccountDashboardPath(getPathname(page))) {
    throw new Error(
      `[select-account] Continue did not reach /account (url=${page.url()}). Options: ${describeAccountSelectOptions(options)}`
    );
  }

  const selectedLabel = await readCardLabel(page, options);
  return { options, selectedLabel };
}

/**
 * When storage already has a session, opening `/account` may redirect to `/select-account`.
 * Resolves picker → dashboard using merged env + explicit options.
 */
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

/**
 * Assert dashboard loaded and, when possible, the active account label appears in the shell.
 */
export async function assertActiveAccountContext(
  page: Page,
  result: SelectAccountResult
): Promise<void> {
  await waitForDashboardReadiness(page);

  const nameHint = result.options.accountName ?? result.selectedLabel;
  if (nameHint) {
    const fragment = nameHint.split(/\s+/)[0];
    if (fragment.length >= 3) {
      await expect(page.locator('body')).toContainText(new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), {
        timeout: 20_000,
      });
    }
  }
}
