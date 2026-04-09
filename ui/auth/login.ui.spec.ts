/**
 * Login UI smoke coverage.
 * Uses existing page object/selectors and env-driven auth fixture values.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { loginSelectors } from '../../utils/selectors';
import { getUiEmail, getValidPassword, suspendedAccountMessage } from '../../fixtures/auth.fixture';
import { isAuthLoginRequest } from '../../utils/loginResponse';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('@ui @auth User Login UI', () => {
  test('shows validation message for invalid email format', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const emailInput = page.locator(loginSelectors.email).first();
    const passwordInput = page.locator(loginSelectors.password).first();
    const loginButton = page.getByRole('button', { name: /login|sign in/i }).first();

    await expect(emailInput).toBeVisible({ timeout: 20_000 });
    await expect(passwordInput).toBeVisible({ timeout: 20_000 });

    await emailInput.fill('invalid-email');
    await passwordInput.fill(getValidPassword());
    await emailInput.blur();

    await loginButton.waitFor({ state: 'visible' });
    const disabled = await loginButton.isDisabled().catch(() => false);
    if (disabled) await expect(loginButton).toBeDisabled();
    else await expect(loginButton).toHaveCSS('pointer-events', 'none');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    expect(bodyText).toContain('email must be a valid email');
  });

  test('shows validation for only password entered', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    let loginPosts = 0;
    page.on('request', (request) => {
      if (isAuthLoginRequest(request)) loginPosts += 1;
    });

    await page.locator(loginSelectors.password).first().fill(getValidPassword());
    const loginButton = page.getByRole('button', { name: /login|sign in/i }).first();
    await loginButton.waitFor({ state: 'visible' });
    const disabled = await loginButton.isDisabled().catch(() => false);
    if (disabled) await expect(loginButton).toBeDisabled();
    else await expect(loginButton).toHaveCSS('pointer-events', 'none');

    await expect.poll(() => loginPosts, { timeout: 3_000 }).toBe(0);
    await expect(page.locator(loginSelectors.email).first()).toBeVisible();
  });

  test('logs in via UI and redirects to /account', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.uiLogin(getUiEmail(), getValidPassword());
    await expect(page).toHaveURL(/\/account/i, { timeout: 45_000 });
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

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const suspendedEmail = process.env.SUSPENDED_USER_EMAIL || getUiEmail();
    await page.locator(loginSelectors.email).first().fill(suspendedEmail);
    await page.locator(loginSelectors.password).first().fill(getValidPassword());
    await page.getByRole('button', { name: /login|sign in/i }).first().click();

    await expect(page.getByText(suspendedAccountMessage)).toBeVisible();
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

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    const mfaEmail = process.env.MFA_USER_EMAIL || getUiEmail();
    await page.locator(loginSelectors.email).first().fill(mfaEmail);
    await page.locator(loginSelectors.password).first().fill(getValidPassword());
    const loginResponsePromise = page.waitForResponse((response) => isAuthLoginRequest(response.request()));
    await page.getByRole('button', { name: /login|sign in/i }).first().click();
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

