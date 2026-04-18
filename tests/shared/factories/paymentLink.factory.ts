/**
 * Deterministic-ish defaults for payment-link payloads (extend per API contract).
 */
export function buildPaymentLinkName(prefix = 'Automation Link'): string {
  return `${prefix} ${Date.now()}`;
}

export function defaultPaymentLinkAmount(): string {
  return '1000';
}
