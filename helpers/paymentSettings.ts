import type { APIRequestContext, APIResponse, FilePayload } from '@playwright/test';
import { resolveApiUrl } from '../utils/api';

export type UpdatePaymentSettingsMultipart = {
  logo?: FilePayload | undefined;
  accountId?: string;
  name?: string;
  address?: string;
  type?: string;
  settingId?: string;
};

export type UpdatePaymentSettingsSuccessBody = {
  success: true;
  message: 'Payment settings updated successfully';
  data: unknown;
};

export async function updatePaymentSettings(
  request: APIRequestContext,
  token: string | null,
  multipart: UpdatePaymentSettingsMultipart,
  options: { contentTypeOverride?: string; timeoutMs?: number } = {}
): Promise<{ response: APIResponse; durationMs: number; body: unknown }> {
  const multipartClean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(multipart)) {
    if (typeof v === 'undefined') continue;
    multipartClean[k] = v;
  }

  const started = Date.now();
  // Use `fetch` to ensure multipart works with PATCH across Playwright versions.
  const response = await request.fetch(resolveApiUrl('/v1/payment/settings/update'), {
    method: 'PATCH',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: '*/*',
      ...(options.contentTypeOverride ? { 'Content-Type': options.contentTypeOverride } : {}),
    },
    multipart: multipartClean as any,
    failOnStatusCode: false,
    ...(typeof options.timeoutMs === 'number' ? { timeout: options.timeoutMs } : {}),
  });
  const durationMs = Date.now() - started;
  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => '') }));
  return { response, durationMs, body };
}

