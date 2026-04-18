/**
 * Login page screenshot — lives under `auth/` so `ui-login` project runs it (empty storageState).
 * Opt-in with `VISUAL_REGRESSION=1` and `--update-snapshots` when baselines change.
 */
import { test, expect } from '@playwright/test';

test.describe('@auth Visual — login page (opt-in)', () => {
  test.beforeEach(() => {
    test.skip(process.env.VISUAL_REGRESSION !== '1', 'Set VISUAL_REGRESSION=1 for screenshots');
  });

  test('login landing', async ({ page }) => {
    await test.step('Open login', async () => {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
    });
    await expect(page).toHaveScreenshot('login.png', { fullPage: true, maxDiffPixels: 500 });
  });
});
