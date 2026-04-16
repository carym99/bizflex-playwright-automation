import type { APIRequestContext, APIResponse } from '@playwright/test';
import { expect } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody } from '../utils/api';
import { getLoginPath, getValidEmail, getValidPassword } from '../fixtures/auth.fixture';

/**
 * Request shape observed from live API validation errors:
 * - `settingId` is required
 * - `amount` must be a number and must be >= 1000
 */
export type CreatePaymentLinkRequest = {
  settingId: number;
  name: string;
  amount: number;
  description: string;
  type?: string;
  includePaymentDetails?: boolean;
  phone?: string;
  email?: string;
  chargeCustomer?: boolean;
  currency?: string;
  reference?: string;
  slug?: string;
};

/**
 * Response model (server returns a richer object; keep flexible).
 */
export type CreatePaymentLinkResponseData = Record<string, unknown> & {
  uid?: string;
  reference?: string;
  slug?: string;
  url?: string;
  status?: string;
  setupStatus?: string;
  currency?: string;
  amount?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export type CreatePaymentLinkSuccessResponse = {
  success: true;
  message: string;
  data: CreatePaymentLinkResponseData;
};

export type PaymentLinkErrorResponse = {
  success?: boolean;
  message?: unknown;
  error?: unknown;
  code?: unknown;
  statusCode?: unknown;
};

export function uniquePaymentLinkSeed() {
  const ts = Date.now();
  const rand = Math.random().toString(16).slice(2, 8);
  return { ts, rand };
}

/**
 * Builds a create payload with unique fields to avoid collisions between runs.
 * IDs default to env overrides, falling back to sample values from the provided contract.
 */
export function buildCreatePaymentLinkPayload(
  overrides: Partial<CreatePaymentLinkRequest> = {}
): CreatePaymentLinkRequest {
  const { ts, rand } = uniquePaymentLinkSeed();
  const reference = overrides.reference ?? `BFLXPL-${String(ts).slice(-5)}${rand.toUpperCase()}`;
  const slug = overrides.slug ?? `${rand}${String(ts).slice(-3)}`;
  const email = overrides.email ?? `ktest16+pl_${ts}@yopmail.com`;

  const settingIdRaw =
    overrides.settingId ??
    Number(process.env.PAYMENT_LINK_SETTING_ID || process.env.PAYMENT_LINK_PAYMENT_SETTING_ID || '474');
  const settingId = Number.isFinite(settingIdRaw) ? Number(settingIdRaw) : 474;

  return {
    settingId,
    name: overrides.name ?? 'API merchant',
    amount: overrides.amount ?? 1000,
    description: overrides.description ?? 'testing paymentlink',
    ...(typeof overrides.type === 'string' ? { type: overrides.type } : {}),
    includePaymentDetails: overrides.includePaymentDetails ?? false,
    phone: overrides.phone ?? '+234023431221',
    email,
    chargeCustomer: overrides.chargeCustomer ?? false,
    currency: overrides.currency ?? 'NGN',
    reference,
    slug,
  };
}

export async function loginForAccessToken(request: APIRequestContext): Promise<string> {
  const email = getValidEmail();
  const password = getValidPassword();
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  expect(response.status(), 'Login must succeed to obtain bearer token').toBe(200);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const token = extractTokenFromLoginBody(body);
  expect(token, 'Login response missing access token').toBeTruthy();
  return String(token);
}

export async function postCreatePaymentLink(
  request: APIRequestContext,
  token: string | null,
  payload: unknown,
  options: { contentType?: string } = {}
): Promise<{ response: APIResponse; durationMs: number; body: unknown }> {
  const started = Date.now();
  const response = await request.post(resolveApiUrl('/v1/payment/link/create'), {
    data: payload as any,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: '*/*',
      'Content-Type': options.contentType ?? 'application/json',
    },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
  return { response, durationMs, body };
}

export async function getDynamicPaymentLinkList(
  request: APIRequestContext,
  token: string,
  params: { accountId: string | number; page?: number; limit?: number }
): Promise<{ response: APIResponse; durationMs: number; body: unknown }> {
  const search = new URLSearchParams();
  search.set('accountId', String(params.accountId));
  search.set('page', String(params.page ?? 1));
  search.set('limit', String(params.limit ?? 10));

  const started = Date.now();
  const response = await request.get(resolveApiUrl(`/v1/payment/dynamic/list?${search.toString()}`), {
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
  return { response, durationMs, body };
}

export function assertErrorContract(body: unknown): void {
  const b = (body && typeof body === 'object' ? (body as PaymentLinkErrorResponse) : {}) as PaymentLinkErrorResponse;
  expect(
    typeof b.message === 'string' || typeof b.error === 'string' || typeof b.code === 'string',
    `Expected error body to include message/error/code, got: ${JSON.stringify(body).slice(0, 500)}`
  ).toBe(true);
  if (typeof b.success !== 'undefined') expect(Boolean(b.success)).toBe(false);
}

