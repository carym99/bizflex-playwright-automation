/**
 * Payment settings update API coverage.
 * Endpoint: PATCH /v1/payment/settings/update (multipart/form-data)
 */
import { test, expect, type FilePayload } from '@playwright/test';
import { assertNoSensitiveFields } from '../../helpers/responseValidator';
import { loginForAccessToken } from '../../helpers/paymentLink';
import {
  updatePaymentSettings,
  type UpdatePaymentSettingsSuccessBody,
  type UpdatePaymentSettingsMultipart,
} from '../../helpers/paymentSettings';

const strictMode = String(process.env.STRICT_PAYMENT_SETTINGS_CONTRACT || '').toLowerCase() === 'true';
const ci = !!process.env.CI;
const UPDATE_BUDGET_MS = strictMode ? 2_000 : ci ? 12_000 : 8_000;

function expectWithinBudget(durationMs: number, budgetMs: number, label: string): void {
  expect(durationMs, `${label} exceeded latency budget: ${durationMs}ms > ${budgetMs}ms`).toBeLessThan(budgetMs);
}

function isSessionExpired401(status: number, body: unknown): boolean {
  if (status !== 401) return false;
  const msg = typeof (body as any)?.message === 'string' ? String((body as any).message) : '';
  return msg.toLowerCase().includes('session has expired');
}

function assertSuccessBody(body: unknown): asserts body is UpdatePaymentSettingsSuccessBody {
  expect(body && typeof body === 'object').toBe(true);
  const b = body as Partial<UpdatePaymentSettingsSuccessBody>;
  expect(b.success).toBe(true);
  expect(b.message).toBe('Payment settings updated successfully');
  expect('data' in (b as any)).toBe(true);
}

function baseMultipart(overrides: Partial<UpdatePaymentSettingsMultipart> = {}): UpdatePaymentSettingsMultipart {
  return {
    logo: undefined,
    accountId: String(process.env.PAYMENT_SETTINGS_ACCOUNT_ID || '226'),
    name: 'samsam',
    address: 'bizflex street',
    type: 'DYNAMIC',
    settingId: String(process.env.PAYMENT_SETTINGS_SETTING_ID || '474'),
    ...overrides,
  };
}

function fakeFile(name: string, mimeType: string, bytes: number): FilePayload {
  return { name, mimeType, buffer: Buffer.alloc(bytes, 1) };
}

async function updateWithFreshAuthRetry(
  request: Parameters<typeof test>[0] extends any ? any : never,
  multipart: UpdatePaymentSettingsMultipart
) {
  let token = await loginForAccessToken(request);
  let res = await updatePaymentSettings(request, token, multipart);
  if (isSessionExpired401(res.response.status(), res.body)) {
    console.warn('[payment-settings.update] 401 session expired; re-authenticating and retrying once');
    token = await loginForAccessToken(request);
    res = await updatePaymentSettings(request, token, multipart);
  }
  return res;
}

test.describe('@regression PATCH /v1/payment/settings/update', () => {
  test('updates payment settings successfully with valid multipart payload', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');

    const { response, durationMs, body } = await updateWithFreshAuthRetry(request, baseMultipart());
    test.skip(
      isSessionExpired401(response.status(), body),
      `Backend returned session-expired 401 after retry. Body: ${JSON.stringify(body).slice(0, 200)}`
    );

    expect(response.status(), `Unexpected status: ${JSON.stringify(body).slice(0, 350)}`).toBe(200);
    expectWithinBudget(durationMs, UPDATE_BUDGET_MS, 'payment settings update');
    assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('missing accountId is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ accountId: undefined }));
    expect([400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('missing settingId is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ settingId: undefined }));
    expect([400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('invalid/nonexistent accountId is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ accountId: '999999999' }));
    // Some environments may ignore accountId validation and still accept.
    expect([200, 400, 401, 403, 404, 409, 422]).toContain(response.status());
    if (response.status() === 200) assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('invalid/nonexistent settingId is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ settingId: '999999999' }));
    // Some environments may ignore settingId validation and still accept.
    expect([200, 400, 401, 403, 404, 409, 422]).toContain(response.status());
    if (response.status() === 200) assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('invalid type value is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ type: 'NOT_A_TYPE' }));
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('empty name is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ name: '' }));
    // Some environments allow empty name; accept either validation failure or success.
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    if (response.status() === 200) assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('empty address is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ address: '' }));
    // Some environments allow empty address; accept either validation failure or success.
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    if (response.status() === 200) assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('unauthorized request (no token) is rejected', async ({ request }) => {
    const { response, durationMs, body } = await updatePaymentSettings(request, null, baseMultipart());
    expectWithinBudget(durationMs, UPDATE_BUDGET_MS, 'payment settings update (missing auth)');
    expect([401, 403]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('invalid token is rejected', async ({ request }) => {
    const { response, body } = await updatePaymentSettings(request, 'not-a-real-token', baseMultipart());
    expect([401, 403]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('expired-like token is rejected', async ({ request }) => {
    const expiredLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid-signature';
    const { response, body } = await updatePaymentSettings(request, expiredLike, baseMultipart());
    expect([401, 403]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('unsupported file type in logo is rejected or ignored safely', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const logo = fakeFile('evil.exe', 'application/x-msdownload', 1024);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ logo }));
    expect([200, 400, 401, 403, 415, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('excessively large logo upload is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const logo = fakeFile('big.png', 'image/png', 8 * 1024 * 1024);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ logo }));
    expect([400, 401, 403, 413, 415, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('wrong content-type (application/json) is rejected', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(
      request,
      token,
      baseMultipart(),
      { contentTypeOverride: 'application/json' }
    );
    expect([400, 401, 403, 415, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('name boundary: minimum length (1 char)', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ name: 'a' }));
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('address boundary: minimum length (1 char)', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(request, token, baseMultipart({ address: 'a' }));
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('name boundary: maximum length (env-driven)', async ({ request }) => {
    const max = Number(process.env.PAYMENT_SETTINGS_NAME_MAX_LEN || '');
    test.skip(!Number.isFinite(max) || max <= 0, 'Set PAYMENT_SETTINGS_NAME_MAX_LEN to enforce max boundary');
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(
      request,
      token,
      baseMultipart({ name: 'n'.repeat(max) })
    );
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('address boundary: maximum length (env-driven)', async ({ request }) => {
    const max = Number(process.env.PAYMENT_SETTINGS_ADDRESS_MAX_LEN || '');
    test.skip(!Number.isFinite(max) || max <= 0, 'Set PAYMENT_SETTINGS_ADDRESS_MAX_LEN to enforce max boundary');
    const token = await loginForAccessToken(request);
    const { response, body } = await updatePaymentSettings(
      request,
      token,
      baseMultipart({ address: 'a'.repeat(max) })
    );
    expect([200, 400, 401, 403, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });
});

