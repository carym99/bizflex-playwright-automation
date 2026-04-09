/**
 * Auth fixture helpers (env-driven, no hardcoded secrets).
 */
export function getValidEmail(): string {
  const email = process.env.VALID_USER_EMAIL || process.env.TEST_EMAIL;
  if (!email) throw new Error('Set VALID_USER_EMAIL or TEST_EMAIL in env.');
  return email;
}

export function getUiEmail(): string {
  return process.env.UI_USER_EMAIL || getValidEmail();
}

export function getValidPassword(): string {
  const password = process.env.TEST_PASSWORD;
  if (!password) throw new Error('Set TEST_PASSWORD in env.');
  return password;
}

export function getLoginPath(): string {
  return process.env.AUTH_API_LOGIN_PATH || '/v1/auth/login';
}

export const suspendedAccountMessage =
  'Account has been suspended due to multiple incorrect login attempts. Please contact support for assistance.';

