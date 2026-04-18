import type { Page, Route } from '@playwright/test';

/**
 * Example pattern: stub slow or flaky HTTP from the **browser** side while still exercising UI.
 * Prefer APIRequestContext for pure API tests; use `page.route` when the SPA must render real loading / error states.
 *
 * Call from a test with `await attachOptionalTransactionEmptyList(page)` then navigate to a screen that fetches transactions.
 */
export async function attachOptionalTransactionEmptyList(page: Page): Promise<void> {
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    if (request.url().toLowerCase().includes('transaction')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
      return;
    }
    await route.continue();
  });
}

/**
 * Simulate a 500 from a matching path segment — useful for error banners / retry UI.
 */
export async function attachOptionalApiServerError(page: Page, pathSubstring: string): Promise<void> {
  await page.route('**/api/**', async (route: Route) => {
    if (route.request().url().toLowerCase().includes(pathSubstring.toLowerCase())) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'Simulated server error' }),
      });
      return;
    }
    await route.continue();
  });
}
