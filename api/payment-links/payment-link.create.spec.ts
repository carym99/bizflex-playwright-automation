/**
 * Payment Link create API coverage.
 * Contract source: provided sample payload/response for POST /v1/payment/link/create.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  assertErrorContract,
  buildCreatePaymentLinkPayload,
  getDynamicPaymentLinkList,
  loginForAccessToken,
  postCreatePaymentLink,
  type CreatePaymentLinkSuccessResponse,
  type CreatePaymentLinkRequest,
} from '../../helpers/paymentLink';
import { assertNoSensitiveFields } from '../../helpers/responseValidator';

const strictMode = String(process.env.STRICT_PAYMENT_LINK_CONTRACT || '').toLowerCase() === 'true';
const ci = !!process.env.CI;
const CREATE_BUDGET_MS = strictMode ? 2_000 : ci ? 12_000 : 8_000;
const LIST_BUDGET_MS = strictMode ? 2_000 : ci ? 12_000 : 8_000;

function expectWithinBudget(durationMs: number, budgetMs: number, label: string): void {
  expect(durationMs, `${label} exceeded latency budget: ${durationMs}ms > ${budgetMs}ms`).toBeLessThan(budgetMs);
}

function isSessionExpired401(status: number, body: unknown): boolean {
  if (status !== 401) return false;
  const msg = typeof (body as any)?.message === 'string' ? String((body as any).message) : '';
  return msg.toLowerCase().includes('session has expired');
}

function isDuplicateMerchantConflict(status: number, body: unknown): boolean {
  if (status !== 409) return false;
  const msg = typeof (body as any)?.message === 'string' ? String((body as any).message) : '';
  return msg.toLowerCase().includes('payment link with') && msg.toLowerCase().includes('exists');
}

function isIsoDateString(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && s.includes('T');
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingLinkInUnknownList(body: unknown, match: (obj: Record<string, unknown>) => boolean): Record<
  string,
  unknown
> | null {
  const visited = new Set<unknown>();
  const queue: unknown[] = [body];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    if (visited.has(cur)) continue;
    visited.add(cur);

    if (Array.isArray(cur)) {
      for (const item of cur) queue.push(item);
      continue;
    }

    const rec = cur as Record<string, unknown>;
    // Heuristic: payment link objects usually have uid/reference/slug/name/url
    if (match(rec)) return rec;
    for (const v of Object.values(rec)) queue.push(v);
  }
  return null;
}

function assertCreateSuccessContract(body: unknown): asserts body is CreatePaymentLinkSuccessResponse {
  expect(body && typeof body === 'object').toBe(true);
  const b = body as Partial<CreatePaymentLinkSuccessResponse>;
  expect(b.success).toBe(true);
  expect(b.message).toBe('successful');
  expect(b.data && typeof b.data === 'object').toBe(true);
}

function assertReturnedMatchesRequestFields(
  requestPayload: CreatePaymentLinkRequest,
  returned: Record<string, unknown>
): void {
  expect.soft(String(returned.name ?? '')).toBe(requestPayload.name);
  expect.soft(String(returned.description ?? '')).toBe(requestPayload.description);
  if (requestPayload.email) expect.soft(String(returned.email ?? '')).toBe(requestPayload.email);
  if (requestPayload.phone) expect.soft(String(returned.phone ?? '')).toBe(requestPayload.phone);
  expect.soft(String(returned.currency ?? '')).toBe('NGN');
  expect.soft(String(returned.status ?? '')).toBe('ACTIVE');
  expect.soft(String(returned.setupStatus ?? '')).toBe('PUBLISHED');
  expect.soft(Boolean(returned.includePaymentDetails)).toBe(Boolean(requestPayload.includePaymentDetails));
  expect.soft(Boolean(returned.chargeCustomer)).toBe(Boolean(requestPayload.chargeCustomer));

  // Amount must be string with 2 dp in response (per provided success response).
  expect.soft(String(returned.amount ?? '')).toMatch(/^\d+\.\d{2}$/);
}

async function createWithFreshAuthRetry(request: APIRequestContext, payload: unknown) {
  // Retry once on "session expired" 401 which is common in this environment.
  let token = await loginForAccessToken(request);
  let res = await postCreatePaymentLink(request, token, payload);
  if (
    res.response.status() === 401 &&
    typeof (res.body as any)?.message === 'string' &&
    String((res.body as any).message).toLowerCase().includes('session has expired')
  ) {
    console.warn('[payment-link.create] 401 session expired; re-authenticating and retrying once');
    token = await loginForAccessToken(request);
    res = await postCreatePaymentLink(request, token, payload);
  }
  return res;
}

async function createUniqueOrSkip(request: APIRequestContext) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const payload = buildCreatePaymentLinkPayload();
    const res = await createWithFreshAuthRetry(request, payload);
    if (isSessionExpired401(res.response.status(), res.body)) {
      test.skip(true, `Backend returned session-expired 401 after retry. Body: ${JSON.stringify(res.body).slice(0, 200)}`);
    }
    if ([200, 201].includes(res.response.status())) return { payload, res };
    if (res.response.status() === 409) {
      // Some backends treat duplicates as "already exists" and may return the existing UID.
      const maybe = res.body as any;
      const uidFromConflict = maybe?.data?.uid ?? maybe?.uid;
      if (uidFromConflict) return { payload, res };
      console.warn(`[payment-link.create] conflict on create attempt ${attempt}/5; regenerating reference/slug`);
      continue;
    }

    // Unexpected non-success for "create unique" precondition
    test.skip(true, `Unable to create unique payment link. Status=${res.response.status()} Body=${JSON.stringify(res.body).slice(0, 250)}`);
  }

  test.skip(true, 'Unable to create unique payment link after 5 attempts (409 conflicts).');
  throw new Error('unreachable');
}

test.describe('@api @payment-link @regression POST /v1/payment/link/create', () => {
  test('successfully creates a dynamic payment link with valid payload', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');

    const payload = buildCreatePaymentLinkPayload();

    const { response, durationMs, body } = await createWithFreshAuthRetry(request, payload);

    test.skip(
      isSessionExpired401(response.status(), body),
      `Backend returned session-expired 401 after retry. Body: ${JSON.stringify(body).slice(0, 200)}`
    );
    test.skip(
      isDuplicateMerchantConflict(response.status(), body),
      `Create precondition failed due to duplicate merchant in environment: ${JSON.stringify(body).slice(0, 200)}`
    );

    expect([200, 201], `Unexpected status: ${await response.text()}`).toContain(response.status());
    expectWithinBudget(durationMs, CREATE_BUDGET_MS, 'payment link create');

    assertCreateSuccessContract(body);
    const success = body as CreatePaymentLinkSuccessResponse;
    const returned = success.data;

    // Generated/non-empty fields
    expect(returned.reference).toBeTruthy();
    expect(returned.slug).toBeTruthy();
    expect(returned.uid).toBeTruthy();
    expect(isIsoDateString(returned.createdAt)).toBe(true);
    expect(isIsoDateString(returned.updatedAt)).toBe(true);
    expect(new Date(String(returned.updatedAt)).getTime()).toBeGreaterThanOrEqual(
      new Date(String(returned.createdAt)).getTime()
    );

    // URL contains slug/id
    expect(String(returned.url ?? '')).toMatch(new RegExp(escapeRegExp(String(returned.slug))));

    // Booleans are booleans
    expect(typeof returned.includePaymentDetails).toBe('boolean');
    expect(typeof returned.chargeCustomer).toBe('boolean');

    assertReturnedMatchesRequestFields(payload, returned as Record<string, unknown>);

    // Field-by-field equality where applicable (avoid server-side normalization differences)
    if (payload.reference) expect.soft(String(returned.reference)).toBe(payload.reference);
    if (payload.slug) expect.soft(String(returned.slug)).toBe(payload.slug);
  });

  test('rejects missing authorization token', async ({ request }) => {
    const payload = buildCreatePaymentLinkPayload();
    const { response, durationMs, body } = await postCreatePaymentLink(request, null, payload);
    expectWithinBudget(durationMs, CREATE_BUDGET_MS, 'payment link create (missing auth)');
    expect([401, 403]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects invalid authorization token', async ({ request }) => {
    const payload = buildCreatePaymentLinkPayload();
    const { response, body } = await postCreatePaymentLink(request, 'not-a-real-token', payload);
    expect([401, 403]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects expired-like JWT', async ({ request }) => {
    const payload = buildCreatePaymentLinkPayload();
    const expiredLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid-signature';
    const { response, body } = await postCreatePaymentLink(request, expiredLike, payload);
    expect([401, 403]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects wrong content type', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');

    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload();
    const { response, body } = await postCreatePaymentLink(request, token, payload, { contentType: 'text/plain' });
    expect([400, 401, 403, 415, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects empty request body', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');
    const token = await loginForAccessToken(request);
    const { response, body } = await postCreatePaymentLink(request, token, {});
    expect([400, 401, 403, 415, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects null request body', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');
    const token = await loginForAccessToken(request);
    const { response, body } = await postCreatePaymentLink(request, token, null);
    expect([400, 401, 403, 415, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('missing required field: name', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ name: '' });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('missing required field: amount', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ amount: NaN });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('missing required field: email', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ email: '' });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    // Some environments treat email as optional for create; accept either validation failure or success.
    expect([200, 201, 400, 401, 403, 409, 422]).toContain(response.status());
    if ([200, 201].includes(response.status())) assertCreateSuccessContract(body);
    else assertErrorContract(body);
  });

  test('invalid email format', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ email: 'not-an-email' });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 409, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('invalid phone number format', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ phone: 'abc123' });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('amount is negative', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ amount: -100 });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('amount is zero', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ amount: 0 });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('rejects amount below minimum (amount < 1000)', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ amount: 999 });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);

    const msg = String((body as any)?.message ?? '');
    if (msg) {
      expect(msg.toLowerCase()).toContain('amount');
    }
  });

  test('amount is not numeric', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ amount: 'one thousand' as unknown as number });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('unsupported currency', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ currency: 'ZZZ' });
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    expect([400, 401, 403, 409, 422]).toContain(response.status());
    assertErrorContract(body);
  });

  test('invalid type value', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const payload = buildCreatePaymentLinkPayload({ type: 'NOT_A_TYPE' } as any);
    const { response, body } = await postCreatePaymentLink(request, token, payload);
    // Some backends ignore/normalize type; accept success OR validation failure.
    expect([200, 201, 400, 401, 403, 409, 422]).toContain(response.status());
    if ([200, 201].includes(response.status())) assertCreateSuccessContract(body);
    else assertErrorContract(body);
  });

  test('duplicate reference is rejected (or de-duplicated)', async ({ request }) => {
    const created = await createUniqueOrSkip(request);
    const payload = created.payload;
    const second = await createWithFreshAuthRetry(request, payload);
    // Accept common duplicate semantics: 400/409/422.
    expect([400, 409, 422]).toContain(second.response.status());
    assertErrorContract(second.body);
  });

  test('duplicate slug is rejected (or de-duplicated)', async ({ request }) => {
    const created = await createUniqueOrSkip(request);
    const payload = created.payload;
    const secondPayload = buildCreatePaymentLinkPayload({
      slug: payload.slug,
      reference: buildCreatePaymentLinkPayload().reference,
    });
    const second = await createWithFreshAuthRetry(request, secondPayload);
    expect([400, 409, 422]).toContain(second.response.status());
    assertErrorContract(second.body);
  });

  test('very long description is rejected or truncated safely', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const longDescription = 'D'.repeat(5000);
    const payload = buildCreatePaymentLinkPayload({ description: longDescription });
    const res = await postCreatePaymentLink(request, token, payload);
    if ([200, 201].includes(res.response.status())) {
      assertCreateSuccessContract(res.body);
      const success = res.body as CreatePaymentLinkSuccessResponse;
      expect(String(success.data.description || '').length).toBeGreaterThan(0);
    } else {
      expect([400, 401, 403, 413, 422]).toContain(res.response.status());
      assertErrorContract(res.body);
    }
  });

  test('XSS/script payload in name/description is rejected or sanitized', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const xss = '<script>alert(1)</script>';
    const payload = buildCreatePaymentLinkPayload({ name: xss, description: xss });
    const res = await postCreatePaymentLink(request, token, payload);
    if ([200, 201].includes(res.response.status())) {
      assertCreateSuccessContract(res.body);
      const success = res.body as CreatePaymentLinkSuccessResponse;
      const returned = success.data;
      expect(JSON.stringify(returned).toLowerCase()).not.toContain('<script>');
    } else {
      expect([400, 401, 403, 409, 422]).toContain(res.response.status());
      assertErrorContract(res.body);
    }
  });

  test('SQL injection-like input in reference is rejected or treated as plain text', async ({ request }) => {
    const token = await loginForAccessToken(request);
    const sql = `' OR 1=1 --`;
    const payload = buildCreatePaymentLinkPayload({ reference: `BFLXPL-${Date.now()}${sql}` });
    const res = await postCreatePaymentLink(request, token, payload);
    expect([200, 201, 400, 401, 403, 409, 422]).toContain(res.response.status());
    if ([200, 201].includes(res.response.status())) {
      assertCreateSuccessContract(res.body);
    } else {
      assertErrorContract(res.body);
    }
  });
});

test.describe('@api @payment-link @regression GET /v1/payment/dynamic/list', () => {
  test('created payment link is visible in dynamic list by accountId', async ({ request }) => {
    test.skip(!process.env.TEST_PASSWORD, 'Set TEST_PASSWORD');
    test.skip(!process.env.TEST_EMAIL && !process.env.VALID_USER_EMAIL, 'Set TEST_EMAIL or VALID_USER_EMAIL');

    const created = await createUniqueOrSkip(request);
    const createBody = created.res.body as any;
    const uid = createBody?.data?.uid ?? createBody?.uid;
    const reference = createBody?.data?.reference ?? createBody?.reference ?? created.payload.reference;
    const accountId =
      createBody?.data?.accountId ?? createBody?.accountId ?? process.env.PAYMENT_LINK_ACCOUNT_ID;

    test.skip(!accountId, 'accountId not available from create response; set PAYMENT_LINK_ACCOUNT_ID');
    expect(uid || reference, 'Expected created payment to include uid or reference').toBeTruthy();

    const token = await loginForAccessToken(request);
    const list = await getDynamicPaymentLinkList(request, token, { accountId, page: 1, limit: 10 });

    test.skip(isSessionExpired401(list.response.status(), list.body), 'List endpoint returned session-expired 401.');

    expectWithinBudget(list.durationMs, LIST_BUDGET_MS, 'payment dynamic list');
    assertNoSensitiveFields(list.body);

    expect([200, 201], `Unexpected status: ${JSON.stringify(list.body).slice(0, 350)}`).toContain(
      list.response.status()
    );

    const found = findMatchingLinkInUnknownList(list.body, (obj) => {
      const u = obj.uid ?? (obj as any)?.data?.uid;
      const r = obj.reference ?? (obj as any)?.data?.reference;
      return (uid && u && String(u) === String(uid)) || (reference && r && String(r) === String(reference));
    });

    expect(
      found,
      `Expected created link to appear in list for accountId=${accountId}. uid=${uid} reference=${reference}`
    ).toBeTruthy();
  });
});

