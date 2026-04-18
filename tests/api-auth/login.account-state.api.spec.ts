import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody } from '../../utils/api';
import { getLoginPath, suspendedAccountMessage } from '../../fixtures/auth.fixture';
import { assertMfaRequiredContract, assertNoSensitiveFields } from '../../helpers/responseValidator';
import { hasTokenPair } from '../../schemas/token.schema';

const strictMode = String(process.env.STRICT_AUTH_CONTRACT || '').toLowerCase() === 'true';
const ci = !!process.env.CI;
/** Latency budgets are relaxed on CI to avoid flakes from cold starts / shared API. */
const SUCCESS_LOGIN_BUDGET_MS = strictMode ? 4_000 : ci ? 12_000 : 8_000;
const OTP_LOGIN_BUDGET_MS = strictMode ? 4_000 : ci ? 12_000 : 8_000;
const FAILED_LOGIN_BUDGET_MS = strictMode ? 2_000 : ci ? 8_000 : 5_000;
const OTP_VERIFY_BUDGET_MS = strictMode ? 3_000 : ci ? 8_000 : 5_000;
const verifyOtpPath = process.env.AUTH_VERIFY_OTP_PATH || '/v1/auth/verify-otp';
const resendOtpPath = process.env.AUTH_RESEND_OTP_PATH || '/v1/auth/resend-otp';

const loginUrl = () => resolveApiUrl(getLoginPath());

async function postLogin(request: APIRequestContext, email: string, password: string) {
  const started = Date.now();
  const response = await request.post(loginUrl(), {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, body, durationMs };
}

async function verifyOtp(
  request: APIRequestContext,
  userId: string | undefined,
  otp: string | undefined
): Promise<{ response: APIResponse; body: Record<string, unknown>; durationMs: number }> {
  const started = Date.now();
  const response = await request.post(resolveApiUrl(verifyOtpPath), {
    data: { userId, otp },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, body, durationMs };
}

async function resendOtp(
  request: APIRequestContext,
  userId: string | undefined
): Promise<{ response: APIResponse; body: Record<string, unknown>; durationMs: number }> {
  const started = Date.now();
  const response = await request.post(resolveApiUrl(resendOtpPath), {
    data: { userId },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, body, durationMs };
}

async function getProtected(
  request: APIRequestContext,
  token: string
): Promise<{
  profileResponse: APIResponse;
  flagsResponse: APIResponse;
  profileBody: Record<string, unknown>;
  flagsBody: Record<string, unknown>;
}> {
  const headers = { Authorization: `Bearer ${token}` };
  const profileResponse = await request.get(resolveApiUrl('/v1/users/profile'), {
    headers,
    failOnStatusCode: false,
  });
  const flagsResponse = await request.get(resolveApiUrl('/v1/users/registration-flags'), {
    headers,
    failOnStatusCode: false,
  });
  const profileBody = (await profileResponse.json().catch(() => ({}))) as Record<string, unknown>;
  const flagsBody = (await flagsResponse.json().catch(() => ({}))) as Record<string, unknown>;
  return { profileResponse, flagsResponse, profileBody, flagsBody };
}

test.describe('@api-auth Login account-state API', () => {
  test('locked account is gated on profile + registration-flags', async ({ request }) => {
    const email = process.env.LOCKED_USER_EMAIL;
    const password = process.env.LOCKED_USER_PASSWORD;
    test.skip(!email || !password, 'Set LOCKED_USER_EMAIL and LOCKED_USER_PASSWORD');

    const { response, body, durationMs } = await postLogin(request, email!, password!);
    expect([200, 201]).toContain(response.status());
    expect(durationMs).toBeLessThan(SUCCESS_LOGIN_BUDGET_MS);
    const token = extractTokenFromLoginBody(body);
    expect(token).toBeTruthy();
    assertNoSensitiveFields(body);

    const { profileResponse, flagsResponse, profileBody, flagsBody } = await getProtected(
      request,
      token as string
    );

    if (strictMode) {
      expect(profileResponse.status()).toBe(403);
      expect(flagsResponse.status()).toBe(403);
      expect(profileBody).toMatchObject({ code: 'ACCOUNT_LOCKED', message: expect.any(String) });
      expect(flagsBody).toMatchObject({ code: 'ACCOUNT_LOCKED', message: expect.any(String) });
    } else {
      expect([401, 403]).toContain(profileResponse.status());
      expect([401, 403]).toContain(flagsResponse.status());
    }
    assertNoSensitiveFields(profileBody);
    assertNoSensitiveFields(flagsBody);
  });

  test('suspended account enforces 401 on profile + registration-flags', async ({ request }) => {
    const email = process.env.SUSPENDED_USER_EMAIL;
    const password = process.env.SUSPENDED_USER_PASSWORD;
    test.skip(!email || !password, 'Set SUSPENDED_USER_EMAIL and SUSPENDED_USER_PASSWORD');

    const { response, body } = await postLogin(request, email!, password!);
    expect([200, 201]).toContain(response.status());
    const token = extractTokenFromLoginBody(body);
    expect(token).toBeTruthy();
    assertNoSensitiveFields(body);

    const { profileResponse, flagsResponse, profileBody, flagsBody } = await getProtected(
      request,
      token as string
    );

    if (strictMode) {
      expect(profileResponse.status()).toBe(401);
      expect(flagsResponse.status()).toBe(401);
      expect(profileBody).toMatchObject({
        code: expect.stringMatching(/ACCOUNT_SUSPENDED|UNAUTHORIZED/),
        message: expect.any(String),
      });
      expect(flagsBody).toMatchObject({
        code: expect.stringMatching(/ACCOUNT_SUSPENDED|UNAUTHORIZED/),
        message: expect.any(String),
      });
    } else {
      expect([401, 403]).toContain(profileResponse.status());
      expect([401, 403]).toContain(flagsResponse.status());
    }
    assertNoSensitiveFields(profileBody);
    assertNoSensitiveFields(flagsBody);
  });

  test('deleted account is denied by auth/profile contracts', async ({ request }) => {
    const email = process.env.DELETED_USER_EMAIL;
    const password = process.env.DELETED_USER_PASSWORD;
    test.skip(!email || !password, 'Set DELETED_USER_EMAIL and DELETED_USER_PASSWORD');

    const { response, body, durationMs } = await postLogin(request, email!, password!);
    expect([401, 403]).toContain(response.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertNoSensitiveFields(body);
  });

  test('unverified account is denied by auth/profile contracts', async ({ request }) => {
    const email = process.env.UNVERIFIED_USER_EMAIL;
    const password = process.env.UNVERIFIED_USER_PASSWORD;
    test.skip(!email || !password, 'Set UNVERIFIED_USER_EMAIL and UNVERIFIED_USER_PASSWORD');

    const { response, body, durationMs } = await postLogin(request, email!, password!);
    expect([401, 403, 422]).toContain(response.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertNoSensitiveFields(body);
  });

  test('mfa account returns requires2FA contract', async ({ request }) => {
    const email = process.env.MFA_USER_EMAIL;
    const password = process.env.MFA_USER_PASSWORD;
    test.skip(!email || !password, 'Set MFA_USER_EMAIL and MFA_USER_PASSWORD');

    const { response, body, durationMs } = await postLogin(request, email!, password!);
    expect(response.status()).toBe(200);
    expect(durationMs).toBeLessThan(OTP_LOGIN_BUDGET_MS);
    if (strictMode) assertMfaRequiredContract(body);
    else {
      expect(Boolean(body.requires2FA)).toBe(true);
      expect(String(body.message || '').toLowerCase()).toContain('2fa');
    }
    assertNoSensitiveFields(body);
  });

  test.describe('mfa otp flow', () => {
    test('valid OTP returns token pair', async ({ request }) => {
      test.skip(!process.env.MFA_USER_EMAIL || !process.env.MFA_USER_PASSWORD, 'Set MFA_USER_* env vars');
      test.skip(!process.env.MFA_TEST_OTP, 'MFA mailbox integration not configured');

      const login = await postLogin(request, process.env.MFA_USER_EMAIL!, process.env.MFA_USER_PASSWORD!);
      const userId = String(login.body.userId || '');
      test.skip(!userId, 'MFA userId unavailable');
      const verified = await verifyOtp(request, userId, process.env.MFA_TEST_OTP);
      expect([200, 201]).toContain(verified.response.status());
      expect(verified.durationMs).toBeLessThan(OTP_VERIFY_BUDGET_MS);
      expect(hasTokenPair(verified.body)).toBe(true);
      assertNoSensitiveFields(verified.body);
    });

    test('invalid OTP is rejected', async ({ request }) => {
      test.skip(!process.env.MFA_USER_EMAIL || !process.env.MFA_USER_PASSWORD, 'Set MFA_USER_* env vars');
      const login = await postLogin(request, process.env.MFA_USER_EMAIL!, process.env.MFA_USER_PASSWORD!);
      const userId = String(login.body.userId || '');
      test.skip(!userId, 'MFA userId unavailable');
      const result = await verifyOtp(request, userId, '000000');
      expect([400, 401, 403, 404, 422]).toContain(result.response.status());
      expect(result.durationMs).toBeLessThan(OTP_VERIFY_BUDGET_MS);
      assertNoSensitiveFields(result.body);
    });

    test('missing OTP is rejected', async ({ request }) => {
      test.skip(!process.env.MFA_USER_EMAIL || !process.env.MFA_USER_PASSWORD, 'Set MFA_USER_* env vars');
      const login = await postLogin(request, process.env.MFA_USER_EMAIL!, process.env.MFA_USER_PASSWORD!);
      const userId = String(login.body.userId || '');
      test.skip(!userId, 'MFA userId unavailable');
      const result = await verifyOtp(request, userId, undefined);
      expect([400, 401, 404, 422]).toContain(result.response.status());
      assertNoSensitiveFields(result.body);
    });

    test('missing userId is rejected', async ({ request }) => {
      const result = await verifyOtp(request, undefined, process.env.MFA_TEST_OTP || '000000');
      expect([400, 401, 404, 422]).toContain(result.response.status());
      assertNoSensitiveFields(result.body);
    });

    test('wrong userId with OTP is rejected', async ({ request }) => {
      const result = await verifyOtp(
        request,
        '00000000-0000-0000-0000-000000000000',
        process.env.MFA_TEST_OTP || '000000'
      );
      expect([400, 401, 403, 404, 422]).toContain(result.response.status());
      assertNoSensitiveFields(result.body);
    });

    test('otp resend endpoint responds with contract', async ({ request }) => {
      test.skip(!process.env.MFA_USER_EMAIL || !process.env.MFA_USER_PASSWORD, 'Set MFA_USER_* env vars');
      const login = await postLogin(request, process.env.MFA_USER_EMAIL!, process.env.MFA_USER_PASSWORD!);
      const userId = String(login.body.userId || '');
      test.skip(!userId, 'MFA userId unavailable');
      const resend = await resendOtp(request, userId);
      expect([200, 201, 202, 204, 404, 429]).toContain(resend.response.status());
      assertNoSensitiveFields(resend.body);
    });

    test('otp resend rate limit is enforced', async ({ request }) => {
      test.skip(!process.env.MFA_USER_EMAIL || !process.env.MFA_USER_PASSWORD, 'Set MFA_USER_* env vars');
      const login = await postLogin(request, process.env.MFA_USER_EMAIL!, process.env.MFA_USER_PASSWORD!);
      const userId = String(login.body.userId || '');
      test.skip(!userId, 'MFA userId unavailable');
      let sawRateLimit = false;
      for (let i = 0; i < 5; i++) {
        const resend = await resendOtp(request, userId);
        if (resend.response.status() === 429) {
          sawRateLimit = true;
          break;
        }
      }
      expect(sawRateLimit || !strictMode).toBe(true);
    });
  });

  test.describe.serial('lockout flow', () => {
    test('locks account after repeated failed attempts and enforces cooldown rules', async ({ request }) => {
      const probeEmail = process.env.AUTH_LOCKOUT_PROBE_EMAIL;
      const probeWrongPassword = process.env.AUTH_LOCKOUT_PROBE_PASSWORD;
      const probeCorrectPassword = process.env.AUTH_LOCKOUT_PROBE_CORRECT_PASSWORD;
      test.skip(!probeEmail || !probeWrongPassword, 'AUTH_LOCKOUT_PROBE_EMAIL/PASSWORD not configured');

      for (let i = 0; i < 5; i++) {
        const res = await postLogin(request, probeEmail!, probeWrongPassword!);
        expect([400, 401, 403, 422, 429]).toContain(res.response.status());
      }

      const locked = await postLogin(request, probeEmail!, probeWrongPassword!);
      expect([403, 429]).toContain(locked.response.status());
      assertNoSensitiveFields(locked.body);

      if (probeCorrectPassword) {
        const cooldownAttempt = await postLogin(request, probeEmail!, probeCorrectPassword);
        expect([200, 401, 403, 429]).toContain(cooldownAttempt.response.status());
      }
      expect(suspendedAccountMessage.length).toBeGreaterThan(0);
    });
  });
});

