import type { Page } from '@playwright/test';

const ACCEPT_PATTERNS = [
  /accept/i,
  /agree/i,
  /allow all/i,
  /accept all/i,
  /got it/i,
  /ok,? i understand/i,
  /i understand/i,
];

/**
 * Best-effort dismissal of common cookie / consent banners (role + text fallbacks).
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  for (const pattern of ACCEPT_PATTERNS) {
    const byRole = page.getByRole('button', { name: pattern }).first();
    if (await byRole.isVisible().catch(() => false)) {
      await byRole.click({ force: true }).catch(() => {});
      return;
    }
  }

  const cookieRegion = page.locator('[class*="cookie" i], [id*="cookie" i], [data-testid*="cookie" i]').first();
  if (await cookieRegion.isVisible().catch(() => false)) {
    const innerAccept = cookieRegion.getByRole('button', { name: /accept|agree|ok/i }).first();
    if (await innerAccept.isVisible().catch(() => false)) {
      await innerAccept.click({ force: true }).catch(() => {});
    }
  }
}
