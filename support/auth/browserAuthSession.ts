import type { BrowserContext, Page } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';

/**
 * Throws if the page is already closed (avoids confusing "Target closed" during auth retries).
 */
export function throwIfPageClosed(page: Page, phase: string): void {
  if (page.isClosed()) {
    throw new Error(`[auth] Page unexpectedly closed — ${phase}`);
  }
}

/**
 * True when the SPA shows an authenticated shell and the bearer token works against the API.
 * Uses `page.request` so cookies from the browser context are not required for this check.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  throwIfPageClosed(page, 'isAuthenticated:start');

  const url = page.url();
  if (/\/login/i.test(url)) {
    return false;
  }

  const token = await page.evaluate(() => {
    return (
      window.localStorage.getItem('accessToken') ??
      window.localStorage.getItem('token') ??
      window.localStorage.getItem('authToken')
    );
  });

  if (!token || token.length < 10) {
    return false;
  }

  const validatePath = process.env.AUTH_BROWSER_VALIDATE_PATH || '/v1/users/profile';
  const response = await page.request.get(resolveApiUrl(validatePath), {
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  });

  return response.ok();
}

export async function disposeContext(context: BrowserContext | undefined): Promise<void> {
  if (!context) return;
  await context.close().catch((err) => {
    console.warn('[auth] context.close() ignored error:', err instanceof Error ? err.message : String(err));
  });
}
