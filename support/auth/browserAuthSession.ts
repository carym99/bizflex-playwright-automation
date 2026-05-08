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
 * Reads a bearer token from storage the way the BizFlex SPA does in current builds:
 * top-level `localStorage` keys first, then `sessionStorage.user` JSON (`accessToken`).
 */
/**
 * Polls inside the page until a usable bearer appears in storage. Prefer this over repeated
 * `page.evaluate` during SPA navigations: Playwright re-runs the predicate after `domcontentloaded`
 * when the execution context is replaced, so reads are less flaky than ad-hoc `evaluate` loops.
 */
export async function waitForBearerTokenInPage(page: Page, timeoutMs: number): Promise<void> {
  throwIfPageClosed(page, 'waitForBearerTokenInPage');
  await page.waitForFunction(
    () => {
      const fromLs =
        window.localStorage.getItem('accessToken') ??
        window.localStorage.getItem('token') ??
        window.localStorage.getItem('authToken');
      if (fromLs && fromLs.length >= 10) {
        return true;
      }
      const raw = window.sessionStorage.getItem('user');
      if (!raw) {
        return false;
      }
      try {
        const o = JSON.parse(raw) as { accessToken?: unknown };
        const at = o.accessToken;
        return typeof at === 'string' && at.length >= 10;
      } catch {
        return false;
      }
    },
    { timeout: timeoutMs }
  );
}

export async function getBearerTokenFromPage(page: Page): Promise<string | null> {
  throwIfPageClosed(page, 'getBearerTokenFromPage');
  try {
    return await page.evaluate(() => {
      const fromLs =
        window.localStorage.getItem('accessToken') ??
        window.localStorage.getItem('token') ??
        window.localStorage.getItem('authToken');
      if (fromLs && fromLs.length >= 10) {
        return fromLs;
      }
      const raw = window.sessionStorage.getItem('user');
      if (!raw) {
        return null;
      }
      try {
        const o = JSON.parse(raw) as { accessToken?: unknown };
        const at = o.accessToken;
        if (typeof at === 'string' && at.length >= 10) {
          return at;
        }
      } catch {
        return null;
      }
      return null;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Execution context was destroyed|Target page, context or browser has been closed|navigation/i.test(
        msg
      )
    ) {
      return null;
    }
    throw err;
  }
}

export async function getRefreshTokenFromPage(page: Page): Promise<string | null> {
  throwIfPageClosed(page, 'getRefreshTokenFromPage');
  try {
    return await page.evaluate(() => {
      const fromLs = window.localStorage.getItem('refreshToken');
      if (fromLs && fromLs.length >= 10) {
        return fromLs;
      }
      const raw = window.sessionStorage.getItem('user');
      if (!raw) {
        return null;
      }
      try {
        const o = JSON.parse(raw) as { refreshToken?: unknown };
        const rt = o.refreshToken;
        if (typeof rt === 'string' && rt.length >= 10) {
          return rt;
        }
      } catch {
        return null;
      }
      return null;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Execution context was destroyed|Target page, context or browser has been closed/i.test(msg)) {
      return null;
    }
    throw err;
  }
}

/**
 * Playwright `storageState` persists `localStorage` but not `sessionStorage`. When the SPA only keeps
 * JWTs in `sessionStorage.user`, mirror them so `authenticated-user.json` includes bearer keys.
 */
export async function mirrorSessionUserTokensToLocalStorage(page: Page): Promise<void> {
  throwIfPageClosed(page, 'mirrorSessionUserTokensToLocalStorage');
  try {
    await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('user');
      if (!raw) {
        return;
      }
      try {
        const o = JSON.parse(raw) as { accessToken?: string; refreshToken?: string };
        if (typeof o.accessToken === 'string' && o.accessToken.length > 0) {
          window.localStorage.setItem('accessToken', o.accessToken);
          window.localStorage.setItem('token', o.accessToken);
          window.localStorage.setItem('authToken', o.accessToken);
        }
        if (typeof o.refreshToken === 'string' && o.refreshToken.length > 0) {
          window.localStorage.setItem('refreshToken', o.refreshToken);
        }
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Execution context was destroyed|Target page, context or browser has been closed/i.test(msg)) {
      return;
    }
    throw err;
  }
}

/**
 * True only when pathname is the login route — avoids false positives from query strings like
 * `?redirect=/login` on `/account`, which would match `/\/login/i` on the full URL string.
 */
export function pathnameIsLoginRoute(page: Page): boolean {
  try {
    const p = new URL(page.url()).pathname.toLowerCase();
    return /^\/login(\/|$)/.test(p);
  } catch {
    return /\/login/i.test(page.url());
  }
}

/**
 * True when a usable bearer exists in browser storage and the API accepts it.
 * Uses `page.request` so cookies from the browser context are not required for this check.
 *
 * If the SPA still shows `/login` but tokens are already written (hydration / slow router), we still
 * probe the API — URL alone is not proof of failure.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  throwIfPageClosed(page, 'isAuthenticated:start');

  const token = await getBearerTokenFromPage(page);
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

export type WaitUntilAuthenticatedOptions = {
  /** Label for error messages (e.g. post-ui-login). */
  phase?: string;
  /** Optional timeout override in ms. */
  timeoutMs?: number;
  /** Optional poll interval override in ms. */
  intervalMs?: number;
};

/**
 * After UI login or token injection, storage generation must not race ahead of storage hydration
 * or the first successful profile probe (CI can be slower / briefly return 401 until sessionRef matches).
 */
export async function waitUntilAuthenticated(
  page: Page,
  options: WaitUntilAuthenticatedOptions = {}
): Promise<void> {
  const phase = options.phase ?? 'waitUntilAuthenticated';
  const maxMs = options.timeoutMs ?? (process.env.CI ? 50_000 : 28_000);
  const intervalMs = options.intervalMs ?? (process.env.CI ? 900 : 500);
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    throwIfPageClosed(page, `${phase}:poll`);
    if (await isAuthenticated(page)) {
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const url = page.url();
  const hasToken = Boolean(await getBearerTokenFromPage(page));
  throw new Error(
    `[auth-storage] ${phase}: session not verified within ${maxMs}ms (url=${url}, bearerReadable=${hasToken})`
  );
}

export async function disposeContext(context: BrowserContext | undefined): Promise<void> {
  if (!context) return;
  await context.close().catch((err) => {
    console.warn('[auth] context.close() ignored error:', err instanceof Error ? err.message : String(err));
  });
}
