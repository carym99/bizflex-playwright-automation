/**
 * One-off: log account page body text after UI login (debug selectors).
 * Run: npx ts-node -r dotenv/config scripts/dump-account-body.ts
 */
import { chromium } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { getUiEmail, getValidPassword } from '../fixtures/auth.fixture';

void (async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    baseURL: process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'https://bizflex-app.netlify.app',
  });
  const lp = new LoginPage(page);
  await lp.uiLogin(getUiEmail(), getValidPassword());
  process.stdout.write(await page.locator('body').innerText());
  await browser.close();
})();
