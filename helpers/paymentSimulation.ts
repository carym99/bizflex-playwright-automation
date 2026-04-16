import type { APIRequestContext, APIResponse } from '@playwright/test';
import { resolveApiUrl } from '../utils/api';

export type PaymentSimulationResult = {
  response: APIResponse;
  durationMs: number;
  body: unknown;
};

/**
 * Simulates a customer payment/transfer using an env-configured backend endpoint.
 *
 * This project does not currently include a BizFlex payment webhook/confirm helper.
 * To avoid guessing contracts, configure:
 * - PAYMENT_SIMULATE_PATH (e.g. "/v1/payment/simulate" or internal test-only route)
 * - PAYMENT_SIMULATE_METHOD (default POST)
 *
 * This helper sends the provided `payload` as JSON to the configured path.
 */
export async function simulatePaymentIfConfigured(
  request: APIRequestContext,
  token: string | null,
  payload: Record<string, unknown>
): Promise<PaymentSimulationResult | null> {
  const path = process.env.PAYMENT_SIMULATE_PATH;
  if (!path) return null;

  const method = String(process.env.PAYMENT_SIMULATE_METHOD || 'POST').toUpperCase();
  const started = Date.now();
  const response = await request.fetch(resolveApiUrl(path), {
    method,
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

/**
 * Polls an env-configured payment status endpoint until it returns a terminal state.
 *
 * Configure:
 * - PAYMENT_STATUS_PATH_TEMPLATE (e.g. "/v1/payment/status/{slug}" or "/v1/payment/{reference}/status")
 * - PAYMENT_STATUS_SUCCESS_REGEX (optional, default: /success|completed|paid/i)
 */
export async function pollPaymentStatusIfConfigured(
  request: APIRequestContext,
  token: string | null,
  templateVars: Record<string, string>,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<{ body: unknown; durationMs: number } | null> {
  const template = process.env.PAYMENT_STATUS_PATH_TEMPLATE;
  if (!template) return null;

  let path = template;
  for (const [k, v] of Object.entries(templateVars)) {
    path = path.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }

  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const successRe = new RegExp(process.env.PAYMENT_STATUS_SUCCESS_REGEX || 'success|completed|paid', 'i');
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const res = await request.get(resolveApiUrl(path), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: '*/*',
      },
      failOnStatusCode: false,
    });
    const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
    const text = JSON.stringify(body);
    if (successRe.test(text)) return { body, durationMs: Date.now() - started };
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null;
}

