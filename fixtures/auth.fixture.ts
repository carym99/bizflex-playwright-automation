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

/**
 * Password for UI login (`UI_USER_EMAIL`). Falls back to `VALID_USER_PASSWORD` then `TEST_PASSWORD`.
 */
export function getUiPassword(): string {
  const uiEmail = process.env.UI_USER_EMAIL?.trim();
  if (uiEmail) {
    const uiPass = process.env.UI_USER_PASSWORD?.trim();
    if (uiPass) return uiPass;
    const validEmail = process.env.VALID_USER_EMAIL?.trim();
    if (validEmail === uiEmail) {
      const vp = process.env.VALID_USER_PASSWORD?.trim();
      if (vp) return vp;
    }
  }
  return getValidPassword();
}

/**
 * Email used to obtain a bearer token for `single-transfer` API tests.
 * Prefers `VALID_USER_EMAIL` when set (typical non-PND wallet in `.env.local`), otherwise same as {@link getValidEmail}.
 */
export function getTransferAuthEmail(): string {
  const valid = process.env.VALID_USER_EMAIL?.trim();
  if (valid) return valid;
  return getValidEmail();
}

/**
 * Password paired with {@link getTransferAuthEmail}: when that email is `VALID_USER_EMAIL`, prefer `VALID_USER_PASSWORD`.
 */
export function getTransferAuthPassword(): string {
  const validEmail = process.env.VALID_USER_EMAIL?.trim();
  const transferEmail = getTransferAuthEmail();
  if (validEmail && transferEmail === validEmail) {
    const vp = process.env.VALID_USER_PASSWORD?.trim();
    if (vp) return vp;
  }
  return getValidPassword();
}

export function getLoginPath(): string {
  return process.env.AUTH_API_LOGIN_PATH || '/v1/auth/login';
}

export const suspendedAccountMessage =
  'Account has been suspended due to multiple incorrect login attempts. Please contact support for assistance.';

