/**
 * Protected API and unauthenticated UI entry checks.
 */
import { test, expect } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';
import { assertFailureContract } from '../../helpers/responseValidator';

const profilePath = process.env.AUTH_SESSION_PATH || '/v1/users/profile';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@api-auth Protected routes', () => {
  test('session endpoint rejects missing Authorization', async ({ request }) => {
    const res = await request.get(resolveApiUrl(profilePath), { failOnStatusCode: false });
    test.skip(res.status() === 404, `Session endpoint not available at ${profilePath}`);
    expect([401, 403]).toContain(res.status());
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('unauthenticated browser visit to /account shows login gate or leaves account', async ({ page }) => {
    await page.goto('/account', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load');

    const url = page.url();
    if (/\/login|sign-in|auth/i.test(url)) {
      console.log('[protected-routes] Redirected to auth URL:', url);
      return;
    }

    const passwordGate = page.locator('input[type="password"]').first();
    const loginHeading = page.getByRole('heading', { name: /log\s*in|sign\s*in/i });
    const loginVisible =
      (await passwordGate.isVisible().catch(() => false)) ||
      (await loginHeading.isVisible().catch(() => false));

    if (loginVisible) {
      console.log('[protected-routes] Login UI visible on /account (embedded or overlay)');
      return;
    }

    const quickAction = page.getByText(/Quick Action/i).first();
    await expect(quickAction).not.toBeVisible({ timeout: 15_000 });
  });
});
