import type { APIRequestContext, APIResponse } from '@playwright/test';
import { resolveApiUrl } from '../utils/api';

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

