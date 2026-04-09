import type { Page } from '@playwright/test';

const TIMEOUT_OR_EXPIRED = /session\s*(expired|timed\s*out)|logged\s*out|please\s*sign\s*in\s*again|sign\s*in\s*to\s*continue|your\s*session\s*has\s*expired/i;

export type SessionTimeoutOptions = {
  /** When true, navigate to /login after detecting the modal (still throws). */
  redirectToLogin?: boolean;
};

/**
 * Fails fast when a session timeout / re-auth modal is visible, with CI-friendly logging.
 */
export async function handleSessionTimeout(page: Page, options?: SessionTimeoutOptions): Promise<void> {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: TIMEOUT_OR_EXPIRED }).first();
  const inline = page.getByText(TIMEOUT_OR_EXPIRED).first();

  const dialogVisible = await dialog.isVisible().catch(() => false);
  const inlineVisible = !dialogVisible && (await inline.isVisible().catch(() => false));

  if (!dialogVisible && !inlineVisible) return;

  const url = page.url();
  const title = await page.title().catch(() => '');
  const snippet = (await page.locator('body').innerText().catch(() => '')).slice(0, 800);

  console.error('[session-timeout] Detected session expiry UI', { url, title, snippet });

  if (options?.redirectToLogin) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  throw new Error(
    'Session timeout or forced re-authentication detected. Refresh storage state (npm run auth) or re-run global setup.'
  );
}
