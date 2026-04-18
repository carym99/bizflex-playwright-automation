import type { Locator } from '@playwright/test';

/**
 * Prefer a normal click (actionability checks). Use `force` only when Chakra/portals block hit-testing.
 */
export async function clickWithScrollThenForceFallback(target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await target.click({ timeout: 5_000 });
  } catch {
    await target.click({ force: true }).catch(() => {});
  }
}
