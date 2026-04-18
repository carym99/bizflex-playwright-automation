import { expect } from '@playwright/test';

/**
 * Wraps Playwright's `expect().toPass()` for eventually-consistent APIs (webhooks, async jobs).
 * Prefer this over `waitForTimeout` + manual polling loops.
 *
 * @example
 * await expectEventually(async () => {
 *   const response = await request.get('/v1/payment/status');
 *   expect((await response.json()).status).toBe('SUCCESS');
 * }, { timeout: 20_000 });
 */
export async function expectEventually(
  assertion: () => void | Promise<void>,
  options?: { timeout?: number; intervals?: number[] }
): Promise<void> {
  await expect(assertion).toPass({
    timeout: options?.timeout ?? 15_000,
    intervals: options?.intervals ?? [500, 1_000, 2_000, 3_000],
  });
}
