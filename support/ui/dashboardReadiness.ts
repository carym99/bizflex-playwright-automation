import { expect, type Page } from '@playwright/test';
import {
  pathnameLooksLikeAccountDashboardPath,
  pathnameLooksLikeSelectAccountPath,
} from './accountRoutes';

/** Dashboard shell detection timeout (longer in CI when many workers hit the same SPA). */
export const DASHBOARD_READY_MS = process.env.CI ? 80_000 : 35_000;
const DASHBOARD_FALLBACK_MS = process.env.CI ? 30_000 : 15_000;

const DASHBOARD_TEXT = new RegExp(
  [
    'Quick Action',
    'Suggestions For You',
    'Transfer',
    'Pay Bills',
    'International Transfer',
    'Withdraw Cash',
  ].join('|'),
  'i'
);

/**
 * Returns true if any known dashboard affordance is present.
 */
export async function isDashboardShellVisible(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  const currentUrl = page.url().toLowerCase();
  if (/\/login(\/|$)/.test(currentUrl)) return false;
  try {
    const pathEarly = new URL(page.url()).pathname.trim().toLowerCase();
    if (pathnameLooksLikeSelectAccountPath(pathEarly)) return false;
  } catch {
    /* ignore */
  }

  if ((await page.getByText(DASHBOARD_TEXT).count()) > 0) return true;
  if ((await page.getByPlaceholder(/search/i).count()) > 0) return true;
  if ((await page.locator('[data-testid="account-balance"]').count()) > 0) return true;
  if ((await page.locator('[data-testid*="dashboard" i], [data-testid*="Dashboard"]').count()) > 0)
    return true;
  const cardish =
    (await page.locator('main [class*="card" i], [role="main"] [class*="card" i]').count()) +
    (await page.locator('[data-testid*="card" i]').count());
  if (cardish >= 2) return true;

  try {
    const path = new URL(page.url()).pathname.trim().toLowerCase();
    if (pathnameLooksLikeAccountDashboardPath(path)) {
      if ((await page.locator('main, [role="main"]').count()) > 0) return true;
      const body = await page.locator('body').innerText();
      if (
        /quick action|balance|wallet|account\s+(overview|dashboard)|dashboard|bizflex|ngn|₦|transfer|pay bills|payment link|transactions?/i.test(
          body
        )
      ) {
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function isAuthenticatedShellFallbackVisible(page: Page): Promise<boolean> {
  if (page.isClosed()) return false;
  try {
    const pathname = new URL(page.url()).pathname.trim().toLowerCase();
    if (/^\/login(\/|$)/.test(pathname)) return false;
    if (pathnameLooksLikeSelectAccountPath(pathname)) return false;
    const onKnownAuthedRoute =
      pathnameLooksLikeAccountDashboardPath(pathname) ||
      pathname.includes('payment-link') ||
      pathname.includes('transactions');
    if (!onKnownAuthedRoute) return false;

    // Sidebar + workspace affordances that appear even when dashboard cards lag in CI.
    if ((await page.getByText(/Dashboard|Payment Link|Transactions|Settings|Log Out/i).count()) >= 2) {
      return true;
    }
    if ((await page.getByRole('button', { name: /Create Unique Link|Settings|View Payment Links/i }).count()) > 0) {
      return true;
    }
    if ((await page.locator('table, [role="table"], [data-testid*="table" i]').count()) > 0) return true;
    if ((await page.locator('main, [role="main"], [role="navigation"]').count()) >= 2) return true;
  } catch {
    return false;
  }
  return false;
}

function onKnownAuthenticatedRoute(page: Page): boolean {
  try {
    const pathname = new URL(page.url()).pathname.trim().toLowerCase();
    if (/^\/login(\/|$)/.test(pathname)) return false;
    if (pathnameLooksLikeSelectAccountPath(pathname)) return false;
    return (
      pathnameLooksLikeAccountDashboardPath(pathname) ||
      pathname.includes('payment-link') ||
      pathname.includes('transactions')
    );
  } catch {
    return false;
  }
}

/**
 * Waits until the account shell shows at least one dashboard signal.
 */
export async function waitForDashboardReadiness(page: Page): Promise<void> {
  try {
    await expect
      .poll(async () => isDashboardShellVisible(page), {
        timeout: DASHBOARD_READY_MS,
        intervals: [250, 500, 1_000],
      })
      .toBeTruthy();
    return;
  } catch {
    // Fallback: authenticated shell can be usable before dashboard-specific cards/text render.
    try {
      await expect
        .poll(async () => isAuthenticatedShellFallbackVisible(page), {
          timeout: DASHBOARD_FALLBACK_MS,
          intervals: [500, 1_000, 1_500],
        })
        .toBeTruthy();
    } catch {
      // Last fallback: if we are on an authenticated route and not `/login`, continue.
      // Some CI runs render sparse account shells without typical dashboard markers.
      if (onKnownAuthenticatedRoute(page)) {
        console.warn('[dashboard] Proceeding with sparse authenticated shell (fallback criteria)');
        return;
      }
      throw new Error(`Dashboard shell not ready on url=${page.url()}`);
    }
  }
}
