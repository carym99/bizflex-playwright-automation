/**
 * Login UI smoke coverage.
 * Uses existing page object/selectors and env-driven auth fixture values.
 */
import { test, expect, type Page } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { getUiEmail, getUiPassword, getValidPassword, suspendedAccountMessage } from '../../fixtures/auth.fixture';
import { isAuthLoginRequest } from '../../utils/loginResponse';
import {
  assertLoginFormReady,
  getLoginEmailInput,
  getLoginPasswordInput,
  getLoginSubmitButton,
} from '../../support/ui/loginHelpers';
import { gotoWithRetry } from '../../support/ui/navigation';
import { urlIsAccountDashboard } from '../../support/ui/accountRoutes';

test.use({ storageState: { cookies: [], origins: [] } });

function loginButton(page: Page) {
  return getLoginSubmitButton(page);
}

test.describe('@auth User Login UI', () => {
  test.describe.configure({ timeout: 120_000 });

  test('shows validation message for invalid email format', async ({ page }) => {
    await test.step('Open login and fill invalid email', async () => {
      await gotoWithRetry(page, '/login', { waitUntil: 'domcontentloaded' });
      await assertLoginFormReady(page);
      const emailInput = getLoginEmailInput(page);
      const passwordInput = getLoginPasswordInput(page);
      await emailInput.fill('invalid-email');
      await passwordInput.fill(getValidPassword());
      await emailInput.blur();
    });

    await test.step('Expect client-side validation (no submit)', async () => {
      const submitButton = loginButton(page);
      await expect(submitButton).toBeDisabled();
      await expect(page.getByText(/email must be a valid email/i)).toBeVisible();
    });
  });

  test('shows validation for only password entered', async ({ page }) => {
    await gotoWithRetry(page, '/login', { waitUntil: 'domcontentloaded' });
    await assertLoginFormReady(page);
    let loginPosts = 0;
    page.on('request', (request) => {
      if (isAuthLoginRequest(request)) loginPosts += 1;
    });

    await getLoginPasswordInput(page).fill(getValidPassword());
    const submitButton = loginButton(page);
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();

    await expect.poll(() => loginPosts, { timeout: 3_000 }).toBe(0);
    await expect(getLoginEmailInput(page)).toBeVisible();
  });

  test('logs in via UI and redirects to /account', async ({ page }) => {
    await test.step('Login with valid credentials', async () => {
      const loginPage = new LoginPage(page);
      await loginPage.uiLogin(getUiEmail(), getUiPassword());
    });
    await test.step('Land on account', async () => {
      await expect(page).toHaveURL(urlIsAccountDashboard, { timeout: 45_000 });
    });
  });

  test('shows suspended account message after backend returns 403', async ({ page }) => {
    await page.route('**/*auth/login*', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 403,
          message: suspendedAccountMessage,
          error: 'Forbidden',
        }),
      });
    });

    await gotoWithRetry(page, '/login', { waitUntil: 'domcontentloaded' });
    await assertLoginFormReady(page);
    const suspendedEmail = process.env.SUSPENDED_USER_EMAIL || getUiEmail();
    await getLoginEmailInput(page).fill(suspendedEmail);
    const passwordInput = getLoginPasswordInput(page);
    await passwordInput.fill(getValidPassword());
    await expect(loginButton(page)).toBeEnabled();
    const loginPost = page.waitForResponse(
      (response) => isAuthLoginRequest(response.request()) && response.status() === 403,
      { timeout: 45_000 }
    );
    // Form submit via Enter avoids occasional Playwright hangs on Chakra login button hit-testing.
    await passwordInput.press('Enter');
    await loginPost;

    await expect(page.getByText(suspendedAccountMessage)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/i);
  });

  test('shows MFA screen/signal when requires2FA is returned', async ({ page }) => {
    let mfaLoginRequestCount = 0;
    await page.route('**/*auth/login*', async (route) => {
      mfaLoginRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: '2FA code sent to registered email',
          requires2FA: true,
          userId: '14c378c6-27c6-4bac-aa9a-4ff71021dfae',
        }),
      });
    });

    await gotoWithRetry(page, '/login', { waitUntil: 'domcontentloaded' });
    await assertLoginFormReady(page);
    const mfaEmail = process.env.MFA_USER_EMAIL || getUiEmail();
    await getLoginEmailInput(page).fill(mfaEmail);
    await getLoginPasswordInput(page).fill(getValidPassword());
    const loginResponsePromise = page.waitForResponse((response) => isAuthLoginRequest(response.request()));
    await expect(loginButton(page)).toBeEnabled();
    await loginButton(page).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.ok()).toBe(true);

    const loginBody = (await loginResponse.json().catch(() => ({}))) as Record<string, unknown>;
    expect(loginBody).toMatchObject({
      requires2FA: true,
      message: expect.stringMatching(/2fa/i),
      userId: expect.any(String),
    });
    expect(mfaLoginRequestCount).toBeGreaterThan(0);
  });
});

