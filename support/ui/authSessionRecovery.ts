import { expect, type Page } from '@playwright/test';
import { gotoWithRetry } from './navigation';
import { resolveSelectAccountToDashboardIfNeeded } from './selectAccount';

/** Use pathname only — `page.url()` can contain `login` in unrelated query params. */
export function getPagePathname(page: Page): string {
  try {
    return new URL(page.url()).pathname.toLowerCase();
  } catch {
    return '';
  }
}

export function pathnameLooksLikeLogin(page: Page): boolean {
  return /^\/login(\/|$)/i.test(getPagePathname(page));
}

/**
 * Logs URL and storage keys when diagnosing auth / hydration issues (no token values).
 */
export async function logBrowserAuthDebug(page: Page, label: string): Promise<void> {
  if (page.isClosed()) {
    console.error(`[auth-debug] ${label}: page already closed`);
    return;
  }
  try {
    const snapshot = await page.evaluate(() => ({
      url: window.location.href,
      localStorageKeys: Object.keys({ ...localStorage }),
      sessionStorageKeys: Object.keys({ ...sessionStorage }),
    }));
    console.error(`[auth-debug] ${label}`, JSON.stringify(snapshot, null, 2));
  } catch (e) {
    console.error(
      `[auth-debug] ${label}: could not read storage (navigation in flight):`,
      e instanceof Error ? e.message : String(e)
    );
  }
}

/**
 * Resolves when the SPA is on a known authenticated route (not `/login`).
 */
export async function waitForStableAuthenticatedRoute(page: Page, timeoutMs = 45_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const p = window.location.pathname.toLowerCase();
      const onLogin = /^\/login(\/|$)/.test(p);
      if (onLogin) return false;
      return (
        /^\/select-account(\/|$)/.test(p) ||
        /^\/account(\/|$)/.test(p) ||
        p.includes('payment-link') ||
        /\/transactions?(\/|$)/i.test(p)
      );
    },
    null,
    { timeout: timeoutMs }
  );
}

export async function attemptUiLoginRecovery(page: Page): Promise<boolean> {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    return false;
  }

  if (page.isClosed()) {
    console.warn('[auth] attemptUiLoginRecovery: page is closed');
    return false;
  }

  const emailInput = page
    .locator('[data-testid="email"], [data-testid="email-input"], input[type="email"]')
    .first();
  const passwordInput = page
    .locator('[data-testid="password"], [data-testid="password-input"], input[type="password"]')
    .first();
  const submit = page.getByRole('button', { name: /login|sign in/i }).first();

  const hasLoginForm =
    (await emailInput.isVisible().catch(() => false)) &&
    (await passwordInput.isVisible().catch(() => false)) &&
    (await submit.isVisible().catch(() => false));
  if (!hasLoginForm) return false;

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  await page.waitForURL(/\/select-account|\/account|\/login/i, { timeout: 45_000 });
  await resolveSelectAccountToDashboardIfNeeded(page);
  console.warn('[auth] Seeded session redirected to /login; recovered with UI login fallback');
  return true;
}

/**
 * Re-open `/login` then run UI recovery (when current page is not showing the login form).
 */
export async function attemptUiLoginRecoveryFromLoginRoute(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  await gotoWithRetry(page, '/login', { waitUntil: 'domcontentloaded' });
  return attemptUiLoginRecovery(page);
}
