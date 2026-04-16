/**
 * Single transfer API coverage.
 * Endpoint: POST /v1/account/single-transfer
 */
import { test, expect } from '@playwright/test';
import { assertNoSensitiveFields } from '../../helpers/responseValidator';
import { loginForAccessToken } from '../../helpers/paymentLink';
import { createSingleTransfer, maskAccountNumber, type SingleTransferPayload } from '../../helpers/transfer';
import {
  getTransferAccountId,
  getTransferBankCode,
  getTransferBeneficiaryAccountName,
  getTransferBeneficiaryAccountNumber,
  getTransferBeneficiaryBankName,
  getTransferPin,
} from '../../fixtures/transfer.fixture';

const strictMode = String(process.env.STRICT_TRANSFER_CONTRACT || '').toLowerCase() === 'true';
const ci = !!process.env.CI;
const TRANSFER_BUDGET_MS = strictMode ? 2_000 : ci ? 12_000 : 8_000;

function expectWithinBudget(durationMs: number, budgetMs: number, label: string): void {
  expect(durationMs, `${label} exceeded latency budget: ${durationMs}ms > ${budgetMs}ms`).toBeLessThan(budgetMs);
}

function isSessionExpired401(status: number, body: unknown): boolean {
  if (status !== 401) return false;
  const msg = typeof (body as any)?.message === 'string' ? String((body as any).message) : '';
  return msg.toLowerCase().includes('session has expired');
}

function isAccountFrozen(status: number, body: unknown): boolean {
  if (status !== 400) return false;
  const msg = typeof (body as any)?.message === 'string' ? String((body as any).message) : '';
  return msg.toLowerCase().includes('account is frozen');
}

function baseTransferPayload(overrides: Partial<SingleTransferPayload> = {}): SingleTransferPayload {
  return {
    accountId: Number(getTransferAccountId()),
    amount: 1000,
    bankCode: getTransferBankCode(),
    beneficiaryAccountName: getTransferBeneficiaryAccountName(),
    beneficiaryAccountNumber: getTransferBeneficiaryAccountNumber(),
    beneficiaryBankName: getTransferBeneficiaryBankName(),
    narration: 'Test',
    transactionPin: getTransferPin(),
    ...overrides,
  };
}

function assertSuccessBody(body: unknown): void {
  const b = (body && typeof body === 'object' ? (body as Record<string, unknown>) : {}) as Record<string, unknown>;
  expect(Boolean(b.success)).toBe(true);
  expect(String(b.message || '')).toBe('Transaction is being processed');
}

function assertFailureBody(body: unknown): void {
  const b = (body && typeof body === 'object' ? (body as Record<string, unknown>) : {}) as Record<string, unknown>;
  expect(
    typeof b.message === 'string' || typeof b.error === 'string' || typeof b.code === 'string',
    `Expected failure body to include message/error/code: ${JSON.stringify(body).slice(0, 400)}`
  ).toBe(true);
}

async function createTransferWithFreshAuthRetry(
  request: Parameters<typeof test>[0] extends any ? any : never,
  payload: Partial<SingleTransferPayload>
) {
  let token = await loginForAccessToken(request);
  let res = await createSingleTransfer(request, token, payload);
  if (isSessionExpired401(res.response.status(), res.body)) {
    console.warn('[single-transfer] 401 session expired; re-authenticating and retrying once');
    token = await loginForAccessToken(request);
    res = await createSingleTransfer(request, token, payload);
  }
  return res;
}

test.describe('@api @transfers @regression POST /v1/account/single-transfer', () => {
  test('creates single transfer with valid payload', async ({ request }) => {
    const payload = baseTransferPayload();
    console.log('[single-transfer] amount:', payload.amount);
    console.log('[single-transfer] beneficiary:', maskAccountNumber(payload.beneficiaryAccountNumber));

    const { response, durationMs, body } = await createTransferWithFreshAuthRetry(request, payload);
    test.skip(
      isSessionExpired401(response.status(), body),
      `Session-expired 401 after retry: ${JSON.stringify(body).slice(0, 200)}`
    );
    test.skip(
      isAccountFrozen(response.status(), body),
      `Transfer account frozen in environment: ${JSON.stringify(body).slice(0, 200)}`
    );

    expect(response.status(), `Unexpected status: ${JSON.stringify(body).slice(0, 350)}`).toBe(200);
    expectWithinBudget(durationMs, TRANSFER_BUDGET_MS, 'single transfer');
    assertSuccessBody(body);
    assertNoSensitiveFields(body);
  });

  test('amount exactly 100 should pass', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(request, baseTransferPayload({ amount: 100 }));
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    test.skip(
      isAccountFrozen(response.status(), body),
      `Transfer account frozen in environment: ${JSON.stringify(body).slice(0, 200)}`
    );
    expect([200, 201]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('amount below minimum (99) should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(request, baseTransferPayload({ amount: 99 }));
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
    assertNoSensitiveFields(body);
  });

  test('amount = 0 should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(request, baseTransferPayload({ amount: 0 }));
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('very large amount returns validation or processing response', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(
      request,
      baseTransferPayload({ amount: Number(process.env.TRANSFER_LARGE_AMOUNT || '100000000') })
    );
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([200, 400, 401, 403, 409, 422]).toContain(response.status());
    assertNoSensitiveFields(body);
  });

  test('missing transaction pin should fail', async ({ request }) => {
    const payload = baseTransferPayload() as unknown as Record<string, unknown>;
    delete payload.transactionPin;
    const { response, body } = await createTransferWithFreshAuthRetry(request, payload as Partial<SingleTransferPayload>);
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('invalid transaction pin should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(
      request,
      baseTransferPayload({ transactionPin: '0000' })
    );
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('missing beneficiary account number should fail', async ({ request }) => {
    const payload = baseTransferPayload() as unknown as Record<string, unknown>;
    delete payload.beneficiaryAccountNumber;
    const { response, body } = await createTransferWithFreshAuthRetry(request, payload as Partial<SingleTransferPayload>);
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('invalid beneficiary account number should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(
      request,
      baseTransferPayload({ beneficiaryAccountNumber: '123' })
    );
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('missing bank code should fail', async ({ request }) => {
    const payload = baseTransferPayload() as unknown as Record<string, unknown>;
    delete payload.bankCode;
    const { response, body } = await createTransferWithFreshAuthRetry(request, payload as Partial<SingleTransferPayload>);
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('invalid bank code should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(
      request,
      baseTransferPayload({ bankCode: '999' })
    );
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 404, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('missing accountId should fail', async ({ request }) => {
    const payload = baseTransferPayload() as unknown as Record<string, unknown>;
    delete payload.accountId;
    const { response, body } = await createTransferWithFreshAuthRetry(request, payload as Partial<SingleTransferPayload>);
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('invalid accountId should fail', async ({ request }) => {
    const { response, body } = await createTransferWithFreshAuthRetry(
      request,
      baseTransferPayload({ accountId: 999999999 })
    );
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 404, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('missing narration should fail', async ({ request }) => {
    const payload = baseTransferPayload() as unknown as Record<string, unknown>;
    delete payload.narration;
    const { response, body } = await createTransferWithFreshAuthRetry(request, payload as Partial<SingleTransferPayload>);
    test.skip(isSessionExpired401(response.status(), body), 'Session expired in environment');
    expect([400, 401, 403, 422]).toContain(response.status());
    assertFailureBody(body);
  });

  test('unauthorized request should fail', async ({ request }) => {
    const payload = baseTransferPayload();
    console.log('[single-transfer] amount:', payload.amount);
    console.log('[single-transfer] beneficiary:', maskAccountNumber(payload.beneficiaryAccountNumber));
    const { response, durationMs, body } = await createSingleTransfer(request, null, payload);
    expectWithinBudget(durationMs, TRANSFER_BUDGET_MS, 'single transfer (no auth)');
    expect([401, 403]).toContain(response.status());
    assertFailureBody(body);
  });

  test('expired token should fail', async ({ request }) => {
    const expiredLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid-signature';
    const { response, body } = await createSingleTransfer(request, expiredLike, baseTransferPayload());
    expect([401, 403]).toContain(response.status());
    assertFailureBody(body);
  });
});

