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
const failedLoginBudgetOverride = Number(process.env.FAILED_LOGIN_BUDGET_MS || '');
const defaultFailedLoginBudgetMs = strictMode ? 1_000 : process.env.CI ? 12_000 : 5_000;
const SUCCESS_LOGIN_BUDGET_MS = strictMode ? 2_000 : 15_000;
const FAILED_LOGIN_BUDGET_MS =
  Number.isFinite(failedLoginBudgetOverride) && failedLoginBudgetOverride > 0
    ? failedLoginBudgetOverride
    : defaultFailedLoginBudgetMs;
const VALIDATION_OR_AUTH_STATUSES = [400, 401, 403, 404, 415, 422];
const NETWORK_RETRY_ATTEMPTS = process.env.CI ? 3 : 2;
const NETWORK_RETRY_DELAY_MS = 350;

function expectWithinBudget(durationMs: number, budgetMs: number, label: string): void {
  expect(
    durationMs,
    `${label} exceeded latency budget: ${durationMs}ms > ${budgetMs}ms. Tune FAILED_LOGIN_BUDGET_MS in slower CI if needed.`
  ).toBeLessThan(budgetMs);
}

async function postLogin(request: APIRequestContext, email: unknown, password: unknown) {
  const started = Date.now();
  const res = await postLoginWithTransientRetry(request, {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = asRecord(await res.json().catch(() => ({})));
  return { res, durationMs, body };
}

function isTransientNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toUpperCase();
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('EHOSTUNREACH') ||
    msg.includes('ENOTFOUND')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function postLoginWithTransientRetry(
  request: APIRequestContext,
  options: Parameters<APIRequestContext['post']>[1]
) {
  const url = resolveApiUrl(getLoginPath());
  let lastError: unknown;
  for (let attempt = 1; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      return await request.post(url, options);
    } catch (err) {
      lastError = err;
      if (!isTransientNetworkFailure(err) || attempt === NETWORK_RETRY_ATTEMPTS) {
        throw err;
      }
      console.warn(
        `[login.api] transient network error on attempt ${attempt}/${NETWORK_RETRY_ATTEMPTS}; retrying`,
        err
      );
      await sleep(NETWORK_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}

test.describe('@api-auth Login API', () => {
  const loginUrl = () => resolveApiUrl(getLoginPath());

  test('logs in successfully with valid credentials', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL && !process.env.TEST_EMAIL, 'Set VALID_USER_EMAIL or TEST_EMAIL');
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');

    const started = Date.now();
    const res = await postLoginWithTransientRetry(request, {
      data: {
        email: getValidEmail(),
        password: getValidPassword(),
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    });
    const durationMs = Date.now() - started;

    expect(res.status()).toBe(200);
    expectWithinBudget(durationMs, SUCCESS_LOGIN_BUDGET_MS, 'successful login');

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
    const res = await postLoginWithTransientRetry(request, {
      data: {
        email: getValidEmail(),
        password: 'wrong-password-for-negative-test',
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'wrong-password login rejection');
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects non-existent account credentials (auth negative)', async ({ request }) => {
    const started = Date.now();
    const res = await postLoginWithTransientRetry(request, {
      data: {
        email: 'does-not-exist-auth-check@example.com',
        password: 'NotTheRightPassword123!',
      },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'non-existent account login rejection');
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects malformed payload schema without leaking sensitive fields', async ({ request }) => {
    const started = Date.now();
    const res = await postLoginWithTransientRetry(request, {
      data: { email: 12345, password: { raw: true } },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;

    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'malformed payload login rejection');
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
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'email whitespace login rejection');
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
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'password whitespace login rejection');
    assertFailureContract(body);
  });

  test('handles email case sensitivity consistently', async ({ request }) => {
    test.skip(!process.env.VALID_USER_EMAIL || !process.env.TEST_PASSWORD, 'Set VALID_USER_EMAIL and TEST_PASSWORD');
    const normalizedEmail = (process.env.VALID_USER_EMAIL || '').toUpperCase();
    const { res, durationMs, body } = await postLogin(request, normalizedEmail, process.env.TEST_PASSWORD);
    expect([200, ...VALIDATION_OR_AUTH_STATUSES]).toContain(res.status());
    expectWithinBudget(durationMs, SUCCESS_LOGIN_BUDGET_MS, 'email case normalization login');
    if (res.status() === 200) assertSuccessContract(body);
    else assertFailureContract(body);
  });

  test('rejects empty string fields', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, '', '');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'empty-string login rejection');
    assertFailureContract(body);
  });

  test('rejects null fields', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, null, null);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'null login rejection');
    assertFailureContract(body);
  });

  test('rejects omitted email/password fields', async ({ request }) => {
    const started = Date.now();
    const res = await postLoginWithTransientRetry(request, {
      data: {},
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'omitted fields login rejection');
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects extremely long email input', async ({ request }) => {
    const longEmail = `${'a'.repeat(260)}@example.com`;
    const { res, durationMs, body } = await postLogin(request, longEmail, 'AnyPassword123!');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'long email login rejection');
    assertFailureContract(body);
  });

  test('rejects extremely long password input', async ({ request }) => {
    const longPassword = 'P'.repeat(2048);
    const { res, durationMs, body } = await postLogin(request, 'long-password-case@example.com', longPassword);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'long password login rejection');
    assertFailureContract(body);
  });

  test('rejects unicode email/password payloads', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, 'δοκιμή@example.com', 'päßwørd🙂');
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'unicode credentials login rejection');
    assertFailureContract(body);
  });

  test('rejects SQL injection payload: quote-or-1=1', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, `' OR 1=1 --`, `' OR 1=1 --`);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'SQL injection variant 1 login rejection');
    assertFailureContract(body);
  });

  test('rejects SQL injection payload: admin comment bypass', async ({ request }) => {
    const { res, durationMs, body } = await postLogin(request, `admin'--`, `admin'--`);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'SQL injection variant 2 login rejection');
    assertFailureContract(body);
  });

  test('rejects XSS payloads in credentials', async ({ request }) => {
    const xss = '<script>alert(1)</script>';
    const { res, durationMs, body } = await postLogin(request, xss, xss);
    expect(VALIDATION_OR_AUTH_STATUSES).toContain(res.status());
    expectWithinBudget(durationMs, FAILED_LOGIN_BUDGET_MS, 'XSS credentials login rejection');
    assertFailureContract(body);
  });
});

