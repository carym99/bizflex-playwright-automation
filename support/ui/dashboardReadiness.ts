import { expect, type Page } from '@playwright/test';

/** Dashboard shell detection timeout (longer in CI when many workers hit the same SPA). */
export const DASHBOARD_READY_MS = process.env.CI ? 50_000 : 30_000;

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
    const path = new URL(page.url()).pathname.toLowerCase();
    if (path.includes('account')) {
      const body = await page.locator('body').innerText();
      if (
        /quick action|balance|wallet|account\s+(overview|dashboard)|dashboard|bizflex|ngn|₦|transfer|pay bills/i.test(
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

/**
 * Waits until the account shell shows at least one dashboard signal.
 */
export async function waitForDashboardReadiness(page: Page): Promise<void> {
  await expect
    .poll(async () => isDashboardShellVisible(page), {
      timeout: DASHBOARD_READY_MS,
      intervals: [250, 500, 1_000],
    })
    .toBeTruthy();
}
