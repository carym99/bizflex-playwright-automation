/**
 * Login API coverage (API-first, CI-safe).
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody } from '../../utils/api';
import { getLoginPath, getValidEmail, getValidPassword } from '../../fixtures/auth.fixture';
import {
  asRecord,
  assertFailureContract,
  assertNoSensitiveFields,
  assertSuccessContract,
} from '../../helpers/responseValidator';

const strictMode = String(process.env.STRICT_AUTH_CONTRACT || '').toLowerCase() === 'true';
const SUCCESS_LOGIN_BUDGET_MS = strictMode ? 2_000 : 15_000;
const FAILED_LOGIN_BUDGET_MS = strictMode ? 1_000 : 3_000;
const VALIDATION_OR_AUTH_STATUSES = [400, 401, 403, 404, 415, 422];

async function postLogin(request: APIRequestContext, email: unknown, password: unknown) {
  const started = Date.now();
  const res = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = asRecord(await res.json().catch(() => ({})));
  return { res, durationMs, body };
}

test.describe('@api @auth Login API', () => {
  const loginUrl = () => resolveApiUrl(getLoginPath());

  test('logs in successfully with valid credentials', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL && !process.env.TEST_EMAIL, 'Set VALID_USER_EMAIL or TEST_EMAIL');
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');

    const started = Date.now();
    const res = await request.post(loginUrl(), {
      data: {
        email: getValidEmail(),
        password: getValidPassword(),
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    });
    const durationMs = Date.now() - started;

    expect(res.status()).toBe(200);
    expect(durationMs).toBeLessThan(SUCCESS_LOGIN_BUDGET_MS);

    const body = asRecord(await res.json().catch(() => ({})));
    assertSuccessContract(body);
    const token = extractTokenFromLoginBody(body);
    expect(token).toBeTruthy();
    expect(typeof body.message === 'undefined' || typeof body.message === 'string').toBe(true);
    assertNoSensitiveFields(body);
  });

  test('rejects valid email with wrong password (contract-safe negative)', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL && !process.env.TEST_EMAIL, 'Set VALID_USER_EMAIL or TEST_EMAIL');

    const started = Date.now();
    const res = await request.post(loginUrl(), {
      data: {
        email: getValidEmail(),
        password: 'wrong-password-for-negative-test',
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects non-existent account credentials (auth negative)', async ({ request }) => {
    const started = Date.now();
    const res = await request.post(loginUrl(), {
      data: {
        email: 'does-not-exist-auth-check@example.com',
        password: 'NotTheRightPassword123!',
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects malformed payload schema without leaking sensitive fields', async ({ request }) => {
    const started = Date.now();
    const res = await request.post(loginUrl(), {
      data: { email: 12345, password: { raw: true } },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects email with leading/trailing spaces', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL || !process.env.TEST_PASSWORD, 'Set VALID_USER_EMAIL and TEST_PASSWORD');
    const { res, durationMs, body } = await postLogin(
      request,
      `  ${process.env.VALID_USER_EMAIL}  `,
      process.env.TEST_PASSWORD
    );
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects password with leading/trailing spaces', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL || !process.env.TEST_PASSWORD, 'Set VALID_USER_EMAIL and TEST_PASSWORD');
    const { res, durationMs, body } = await postLogin(
      request,
      process.env.VALID_USER_EMAIL,
      `  ${process.env.TEST_PASSWORD}  `
    );
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('handles email case sensitivity consistently', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL || !process.env.TEST_PASSWORD, 'Set VALID_USER_EMAIL and TEST_PASSWORD');
    const normalizedEmail = (process.env.VALID_USER_EMAIL || '').toUpperCase();
    const { res, durationMs, body } = await postLogin(request, normalizedEmail, process.env.TEST_PASSWORD);
    expect([200, ...VALIDATION_OR_AUTH_STATUSES]).toContain(res.status());
    expect(durationMs).toBeLessThan(SUCCESS_LOGIN_BUDGET_MS);
    if (res.status() === 200) assertSuccessContract(body);
    else assertFailureContract(body);
  });

  test('rejects empty string fields', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, '', '');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects null fields', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, null, null);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects omitted email/password fields', async ({ request }) => {
    const started = Date.now();
    const res = await request.post(loginUrl(), {
      data: {},
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects extremely long email input', async ({ request }) => {
    const longEmail = `${'a'.repeat(260)}@example.com`;
    const { res, durationMs, body } = await postLogin(request, longEmail, 'AnyPassword123!');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects extremely long password input', async ({ request }) => {
    const longPassword = 'P'.repeat(2048);
    const { res, durationMs, body } = await postLogin(request, 'long-password-case@example.com', longPassword);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects unicode email/password payloads', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, 'δοκιμή@example.com', 'päßwørd🙂');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects SQL injection payload: quote-or-1=1', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, `' OR 1=1 --`, `' OR 1=1 --`);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects SQL injection payload: admin comment bypass', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, `admin'--`, `admin'--`);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });

  test('rejects XSS payloads in credentials', async ({ request }) => {
    const xss = '<script>alert(1)</script>';
    const { res, durationMs, body } = await postLogin(request, xss, xss);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expect(durationMs).toBeLessThan(FAILED_LOGIN_BUDGET_MS);
    assertFailureContract(body);
  });
});

