import { expect, type Locator, type Page } from '@playwright/test';
import { loginSelectors } from '../../utils/selectors';

function firstVisible(locator: Locator): Locator {
  return locator.first();
}

export function getLoginEmailInput(page: Page): Locator {
  return firstVisible(
    page
      .getByLabel(/email/i)
      .or(page.getByPlaceholder(/email/i))
      .or(page.getByTestId('email'))
      .or(page.getByTestId('email-input'))
      .or(page.locator(loginSelectors.email))
  );
}

export function getLoginPasswordInput(page: Page): Locator {
  return firstVisible(
    page
      .getByLabel(/password/i)
      .or(page.getByPlaceholder(/password/i))
      .or(page.getByTestId('password'))
      .or(page.getByTestId('password-input'))
      .or(page.locator(loginSelectors.password))
  );
}

export function getLoginSubmitButton(page: Page): Locator {
  return firstVisible(
    page
      .getByRole('button', { name: /login|sign in/i })
      .or(page.getByTestId('login-button'))
      .or(page.locator(loginSelectors.submit))
  );
}

export async function assertLoginFormReady(page: Page): Promise<void> {
  await expect(getLoginEmailInput(page), 'Email input should be visible on login form').toBeVisible({
    timeout: 20_000,
  });
  await expect(getLoginPasswordInput(page), 'Password input should be visible on login form').toBeVisible({
    timeout: 20_000,
  });
  await expect(getLoginSubmitButton(page), 'Login submit button should be visible on login form').toBeVisible({
    timeout: 20_000,
  });
}

