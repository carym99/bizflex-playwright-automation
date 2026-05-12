import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { extractTokenFromLoginBody, resolveApiUrl } from '../utils/api';
import { getLoginPath, getTransferAuthEmail, getTransferAuthPassword } from '../fixtures/auth.fixture';

export type SingleTransferPayload = {
  accountId: number;
  amount: number;
  bankCode: string;
  beneficiaryAccountName: string;
  beneficiaryAccountNumber: string;
  beneficiaryBankName: string;
  narration: string;
  transactionPin: string;
};

export type SingleTransferResult = {
  response: APIResponse;
  durationMs: number;
  body: unknown;
};

export function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber) return '****';
  const last4 = accountNumber.slice(-4);
  return `******${last4}`;
}

/** Login for transfer API tests — prefers `VALID_USER_EMAIL` / `VALID_USER_PASSWORD` when set (see `auth.fixture`). */
export async function loginForTransferAccessToken(request: APIRequestContext): Promise<string> {
  const email = getTransferAuthEmail();
  const password = getTransferAuthPassword();
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  expect(response.status(), 'Login must succeed to obtain bearer token for single-transfer').toBe(200);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const token = extractTokenFromLoginBody(body);
  expect(token, 'Login response missing access token').toBeTruthy();
  return String(token);
}

export async function createSingleTransfer(
  request: APIRequestContext,
  token: string | null,
  payload: Partial<SingleTransferPayload>
): Promise<SingleTransferResult> {
  const started = Date.now();
  const response = await request.post(resolveApiUrl('/v1/account/single-transfer'), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: '*/*',
      'Content-Type': 'application/json',
    },
    data: payload,
    failOnStatusCode: false,
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
  return { response, durationMs, body };
}

