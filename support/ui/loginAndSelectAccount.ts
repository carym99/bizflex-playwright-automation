import type { Page } from '@playwright/test';
import type { AccountSelectOptions } from '../../config/accountContext';
import { getUiEmail, getValidPassword } from '../../fixtures/auth.fixture';
import { LoginPage } from '../../pages/LoginPage';
import {
  assertActiveAccountContext,
  resolveSelectAccountToDashboardIfNeeded,
  selectAccountOnPicker,
  type SelectAccountResult,
} from './selectAccount';
import { pathnameLooksLikeSelectAccountPath } from './accountRoutes';
import { gotoWithRetry } from './navigation';

export type LoginAndSelectAccountOptions = AccountSelectOptions & {
  email?: string;
  password?: string;
  /** When true (default), skip UI login if already on dashboard or picker with tokens. */
  skipLoginIfAuthenticated?: boolean;
};

function getPathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.trim().toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Full UI path: login → `/select-account` (when shown) → pick account → `/account` dashboard.
 */
export async function loginAndSelectAccount(
  page: Page,
  options: LoginAndSelectAccountOptions = {}
): Promise<SelectAccountResult> {
  const email = options.email ?? getUiEmail();
  const password = options.password ?? getValidPassword();
  const skipLogin = options.skipLoginIfAuthenticated !== false;
  const path = getPathname(page);
  const onPicker = pathnameLooksLikeSelectAccountPath(path);
  const onDashboard = /^\/account(\/|$)/i.test(path);

  const { email: _e, password: _p, skipLoginIfAuthenticated: _s, ...accountOpts } = options;

  if (!skipLogin || (!onPicker && !onDashboard)) {
    const loginPage = new LoginPage(page);
    await loginPage.uiLogin(email, password, accountOpts);
    const afterLogin = await resolveSelectAccountToDashboardIfNeeded(page, accountOpts);
    if (afterLogin) {
      await assertActiveAccountContext(page, afterLogin);
      return afterLogin;
    }
    const fallback: SelectAccountResult = { options: accountOpts };
    await assertActiveAccountContext(page, fallback);
    return fallback;
  }

  if (onPicker) {
    const picked = await selectAccountOnPicker(page, accountOpts);
    await assertActiveAccountContext(page, picked);
    return picked;
  }

  if (onDashboard) {
    await gotoWithRetry(page, '/select-account', { waitUntil: 'domcontentloaded' }).catch(() => {});
    if (pathnameLooksLikeSelectAccountPath(getPathname(page))) {
      const picked = await selectAccountOnPicker(page, accountOpts);
      await assertActiveAccountContext(page, picked);
      return picked;
    }
    const current: SelectAccountResult = { options: accountOpts };
    await assertActiveAccountContext(page, current);
    return current;
  }

  const loginPage = new LoginPage(page);
  await loginPage.uiLogin(email, password, accountOpts);
  const result = (await resolveSelectAccountToDashboardIfNeeded(page, accountOpts)) ?? { options: accountOpts };
  await assertActiveAccountContext(page, result);
  return result;
}
