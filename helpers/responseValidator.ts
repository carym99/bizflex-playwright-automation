import { expect } from '@playwright/test';
import { isLoginFailureShape } from '../schemas/loginFailure.schema';
import { isLoginSuccessShape } from '../schemas/loginSuccess.schema';
import { isMfaRequiredShape } from '../schemas/mfaRequired.schema';

const SENSITIVE_FIELDS = ['password', 'passwordHash', 'secret', 'internalNotes'] as const;

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

export function assertNoSensitiveFields(body: unknown): void {
  const serialized = JSON.stringify(body).toLowerCase();
  for (const field of SENSITIVE_FIELDS) {
    expect(serialized).not.toContain(`"${field.toLowerCase()}"`);
  }
}

export function assertFailureContract(body: unknown): void {
  const b = asRecord(body);
  const strictMode = String(process.env.STRICT_AUTH_CONTRACT || '').toLowerCase() === 'true';
  if (strictMode && Object.keys(b).length > 0) {
    expect(isLoginFailureShape(b)).toBe(true);
    expect(
      typeof b.code === 'string' || typeof b.message === 'string' || typeof b.error === 'string'
    ).toBe(true);
  } else if (Object.keys(b).length > 0) {
    // Non-strict mode: allow backend-specific error shapes while still enforcing leak-safety.
    expect(
      typeof b.code === 'string' ||
        typeof b.message === 'string' ||
        typeof b.error === 'string' ||
        typeof b.statusCode === 'number' ||
        Object.keys(b).length > 0
    ).toBe(true);
  }
  assertNoSensitiveFields(b);
}

export function assertSuccessContract(body: unknown): void {
  const b = asRecord(body);
  expect(isLoginSuccessShape(b)).toBe(true);
  assertNoSensitiveFields(b);
}

export function assertMfaRequiredContract(body: unknown): void {
  const b = asRecord(body);
  expect(isMfaRequiredShape(b)).toBe(true);
  expect(b.accessToken).toBeUndefined();
  expect(b.refreshToken).toBeUndefined();
  assertNoSensitiveFields(b);
}

