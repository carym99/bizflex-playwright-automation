import * as fs from 'fs';
import * as path from 'path';
import { chromium, request as playwrightRequest } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody, extractRefreshTokenFromLoginBody } from '../../utils/api';
import { isLikelyJwt } from '../../schemas/token.schema';
import { logAuthDiagnostics } from './debugAuthState';
import { buildBrowserAuthSeed, loginByApi } from './loginByApi';
import { gotoWithRetry } from '../ui/navigation';
import { LoginPage } from '../../pages/LoginPage';
import {
  disposeContext,
  getBearerTokenFromPage,
  getRefreshTokenFromPage,
  mirrorSessionUserTokensToLocalStorage,
  throwIfPageClosed,
  waitUntilAuthenticated,
} from './browserAuthSession';

export { isAuthenticated, pathnameIsLoginRoute, throwIfPageClosed, waitUntilAuthenticated } from './browserAuthSession';

const STORAGE_FILENAME = 'authenticated-user.json';
const SESSION_SEED_FILENAME = 'authenticated-session-seed.json';

/**
 * UI origin for `localStorage` / `storageState` must match the deployed SPA (e.g. Netlify),
 * not the API host — otherwise injected tokens never apply in the browser.
 */
function resolveUiBaseUrlForAuthStorage(): string {
  const raw = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'https://bizflex-app.netlify.app';
  return raw.trim().replace(/\/$/, '');
}

type LoginApiResponse = {
  message?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  data?: unknown;
  [key: string]: unknown;
};

type AuthSessionSeed = {
  user: LoginApiResponse;
  email: string;
};

function toLoginApiResponse(body: unknown): LoginApiResponse {
  if (!body || typeof body !== 'object') {
    throw new Error('[auth-storage] Login response body is not an object.');
  }
  return body as LoginApiResponse;
}

function getAuthSessionSeedPath(): string {
  return path.join(__dirname, '..', '..', 'storage', SESSION_SEED_FILENAME);
}

async function persistAuthSessionSeed(loginResponse: LoginApiResponse, email: string): Promise<void> {
  const seedPath = getAuthSessionSeedPath();
  await fs.promises.mkdir(path.dirname(seedPath), { recursive: true });
  await fs.promises.writeFile(
    seedPath,
    JSON.stringify(
      {
        user: loginResponse,
        email,
      } satisfies AuthSessionSeed,
      null,
      2
    ),
    'utf8'
  );
}

export function readAuthSessionSeed(): AuthSessionSeed | null {
  const seedPath = getAuthSessionSeedPath();
  if (!fs.existsSync(seedPath)) return null;
  try {
    const raw = fs.readFileSync(seedPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AuthSessionSeed>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.user || typeof parsed.user !== 'object') return null;
    if (!parsed.email || typeof parsed.email !== 'string') return null;
    return { user: parsed.user as LoginApiResponse, email: parsed.email };
  } catch {
    return null;
  }
}

/**
 * When true, first auth attempt injects API tokens + navigates to /account.
 * Default: enabled locally, disabled in CI (SPA often rejects injection → 401 storms).
 * Force on in CI: AUTH_ALLOW_TOKEN_INJECTION=1. Force UI-only everywhere: AUTH_STORAGE_UI_ONLY=1.
 */
function useTokenInjectionAttempt(): boolean {
  if (process.env.AUTH_STORAGE_UI_ONLY === '1') return false;
  if (process.env.AUTH_ALLOW_TOKEN_INJECTION === '1') return true;
  return process.env.CI !== 'true';
}

async function injectTokensAndNavigateToAccount(
  page: Page,
  spaOriginFromBase: string,
  resolvedBaseUrl: URL,
  loginResponse: LoginApiResponse,
  email: string
): Promise<void> {
  throwIfPageClosed(page, 'injectTokens:start');

  const accessToken = extractTokenFromLoginBody(loginResponse);
  if (!accessToken) {
    throw new Error('[auth-storage] Login succeeded but no bearer token found in response body');
  }
  const refreshToken = extractRefreshTokenFromLoginBody(loginResponse) ?? '';
  const browserSeed = buildBrowserAuthSeed(loginResponse);

  const initialPath = resolvedBaseUrl.pathname && resolvedBaseUrl.pathname !== '/' ? resolvedBaseUrl.pathname : '/';
  await gotoWithRetry(page, new URL(initialPath, spaOriginFromBase).toString(), {
    waitUntil: 'domcontentloaded',
  });
  throwIfPageClosed(page, 'injectTokens:after initial goto');

  await page.evaluate(
    ({ loginResponse: lr, email: em, browserSeed: seed }) => {
      const typedResponse = lr as { accessToken?: unknown; refreshToken?: unknown };
      const access = typeof typedResponse.accessToken === 'string' ? typedResponse.accessToken : '';
      const refresh = typeof typedResponse.refreshToken === 'string' ? typedResponse.refreshToken : '';

      localStorage.setItem('token', access);
      localStorage.setItem('accessToken', access);
      localStorage.setItem('authToken', access);
      localStorage.setItem('refreshToken', refresh);
      if (seed.userJson) {
        localStorage.setItem('user', seed.userJson);
      }

      sessionStorage.setItem('user', JSON.stringify(lr));
      sessionStorage.setItem('email', em);
    },
    {
      loginResponse: { ...loginResponse, accessToken, refreshToken },
      email,
      browserSeed: {
        userJson:
          browserSeed.user !== null && browserSeed.user !== undefined
            ? JSON.stringify(browserSeed.user)
            : null,
      },
    }
  );

  throwIfPageClosed(page, 'injectTokens:after evaluate');

  await gotoWithRetry(page, new URL('/', spaOriginFromBase).toString(), {
    waitUntil: 'domcontentloaded',
  });
  await gotoWithRetry(page, new URL('/account', spaOriginFromBase).toString(), {
    waitUntil: 'domcontentloaded',
  });
  throwIfPageClosed(page, 'injectTokens:after /account goto');
}

/**
 * Each attempt uses a brand-new browser context + page. Never retries navigation on a closed page.
 * Saves `storageState` only after `isAuthenticated` succeeds.
 */
async function generateAuthenticatedStorageInBrowser(
  outPath: string,
  uiBaseUrl: string,
  loginResponse: LoginApiResponse,
  email: string,
  password: string
): Promise<void> {
  const rawBase = process.env.PLAYWRIGHT_BASE_URL || uiBaseUrl;
  const resolvedBaseUrl = new URL(rawBase);
  const spaOriginFromBase = resolvedBaseUrl.origin;
  const tryInjectionFirst = useTokenInjectionAttempt();

  const browser = await chromium.launch({
    args: process.env.CI ? ['--disable-dev-shm-usage'] : [],
  });

  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const pathLabel = tryInjectionFirst && attempt === 1 ? 'token-injection' : 'ui-login';
      console.log(
        `[auth-storage] browser auth attempt ${attempt}/2 path=${pathLabel} spaOrigin=${spaOriginFromBase} tryInjectionFirst=${tryInjectionFirst}`
      );

      let context: BrowserContext | undefined;
      let page: Page | undefined;

      try {
        context = await browser.newContext({ baseURL: spaOriginFromBase });
        page = await context.newPage();
        if (process.env.CI) {
          page.setDefaultNavigationTimeout(120_000);
          page.setDefaultTimeout(60_000);
        }

        if (tryInjectionFirst && attempt === 1) {
          await injectTokensAndNavigateToAccount(page, spaOriginFromBase, resolvedBaseUrl, loginResponse, email);
          try {
            await waitUntilAuthenticated(page, { phase: `attempt-${attempt}-post-injection` });
          } catch (e) {
            await logAuthDiagnostics(page, `generateAuthenticatedStorage attempt ${attempt} post-injection`);
            throw e;
          }
          console.log(
            `[auth-storage] attempt 1 post-injection url=${page.url()} tokenPresent=${Boolean(
              await getBearerTokenFromPage(page)
            )}`
          );
        } else {
          const loginPage = new LoginPage(page);
          console.log(`[auth-storage] attempt ${attempt} using UI login (fresh context, no closed-page reuse)`);
          await loginPage.uiLogin(email, password);
          throwIfPageClosed(page, 'after uiLogin');
          try {
            await waitUntilAuthenticated(page, { phase: `attempt-${attempt}-post-ui-login` });
          } catch (e) {
            await logAuthDiagnostics(page, `generateAuthenticatedStorage attempt ${attempt} UI path`);
            throw new Error('[auth-storage] UI login did not pass isAuthenticated (API or /login check)', {
              cause: e instanceof Error ? e : undefined,
            });
          }
          console.log(
            `[auth-storage] attempt ${attempt} post-ui-login url=${page.url()} tokenPresent=${Boolean(
              await getBearerTokenFromPage(page)
            )}`
          );
        }

        await mirrorSessionUserTokensToLocalStorage(page);

        const accessFromStorage =
          (await getBearerTokenFromPage(page)) ?? extractTokenFromLoginBody(loginResponse);
        const refreshFromStorage =
          (await getRefreshTokenFromPage(page)) ??
          extractRefreshTokenFromLoginBody(loginResponse) ??
          '';
        if (!accessFromStorage) {
          throw new Error('[auth-storage] accessToken missing in browser storage after successful auth');
        }

        await persistAuthSessionSeed(
          { ...loginResponse, accessToken: accessFromStorage, refreshToken: refreshFromStorage },
          email
        );
        await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
        await context.storageState({ path: outPath });
        console.log(`[auth-storage] Saved verified storageState → ${outPath} (path=${pathLabel})`);
        await page.close().catch(() => {});
        await disposeContext(context);
        return;
      } catch (err) {
        console.warn(`[auth-storage] attempt ${attempt} failed:`, err instanceof Error ? err.message : String(err));
        if (page && !page.isClosed()) {
          try {
            await logAuthDiagnostics(page, `generateAuthenticatedStorage attempt ${attempt} failure`);
          } catch {
            // ignore diagnostics failures on torn-down pages
          }
        }
        await page?.close().catch(() => {});
        await disposeContext(context);
        if (attempt === 2) {
          throw err;
        }
      }
    }
  } finally {
    await browser.close();
  }
}

/** Resolved path to `storage/authenticated-user.json` (project root). */
export function getAuthenticatedStorageStatePath(): string {
  return path.join(__dirname, '..', '..', 'storage', STORAGE_FILENAME);
}

/**
 * How many `authenticated-user-worker-N.json` clones to maintain (default 16, max 32).
 * Set `AUTH_WORKER_STORAGE_COUNT` if you run more parallel workers than the default.
 */
export function getMaxAuthWorkerStorageSlots(): number {
  const raw = process.env.AUTH_WORKER_STORAGE_COUNT;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) {
    return Math.min(32, Math.floor(n));
  }
  return 16;
}

/**
 * Path to `storage/authenticated-user-worker-{slot}.json` for Playwright worker isolation.
 * `parallelIndex` is 0-based (`testInfo.parallelIndex`); filenames use 1-based slot numbers.
 * If `parallelIndex` exceeds the configured slot count, indices wrap with `%`.
 */
export function getAuthenticatedStorageStatePathForWorker(parallelIndex: number): string {
  const max = getMaxAuthWorkerStorageSlots();
  const slot = max > 0 ? Math.floor(parallelIndex) % max : 0;
  const oneBased = slot + 1;
  const dir = path.dirname(getAuthenticatedStorageStatePath());
  return path.join(dir, `authenticated-user-worker-${oneBased}.json`);
}

/** Copy verified canonical `authenticated-user.json` into every worker slot (`1..max`). */
export async function duplicateCanonicalAuthStorageToWorkerFiles(maxSlots?: number): Promise<void> {
  const canonical = getAuthenticatedStorageStatePath();
  const max = maxSlots ?? getMaxAuthWorkerStorageSlots();
  const buf = await fs.promises.readFile(canonical, 'utf8');
  const dir = path.dirname(canonical);
  await fs.promises.mkdir(dir, { recursive: true });
  for (let i = 1; i <= max; i++) {
    const dest = path.join(dir, `authenticated-user-worker-${i}.json`);
    await fs.promises.writeFile(dest, buf, 'utf8');
  }
  console.log(`[auth-storage] Duplicated canonical → ${max} worker storage file(s)`);
}

/** Copy canonical into the worker slot derived from `parallelIndex` (after regenerating auth). */
export async function duplicateCanonicalToWorkerSlot(parallelIndex: number): Promise<void> {
  const canonical = getAuthenticatedStorageStatePath();
  const dest = getAuthenticatedStorageStatePathForWorker(parallelIndex);
  await fs.promises.copyFile(canonical, dest);
}

type StorageStateFile = {
  origins?: Array<{
    localStorage?: Array<{ name: string; value: string }>;
  }>;
};

function readTokenFromStorageJson(data: StorageStateFile): string | null {
  for (const origin of data.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if (['accessToken', 'token', 'authToken'].includes(entry.name) && entry.value?.length > 10) {
        return entry.value;
      }
    }
  }
  return null;
}

function decodeJwtExpSeconds(token: string): number | null {
  if (!isLikelyJwt(token)) return null;
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

const JWT_SKEW_SECONDS = 120;

async function isAccessTokenAcceptedByApi(token: string): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const sessionPath = process.env.AUTH_SESSION_PATH || '/v1/users/profile';
  const ctx = await playwrightRequest.newContext();
  try {
    const res = await ctx.get(resolveApiUrl(sessionPath), {
      headers: { Authorization: `Bearer ${token}` },
      failOnStatusCode: false,
    });
    if (res.status() === 404) {
      console.warn(
        `[auth-storage] Profile probe 404 at ${sessionPath} — treating token as valid only if JWT exp is in the future`
      );
      const expSec = decodeJwtExpSeconds(token);
      return expSec !== null && expSec > nowSec + JWT_SKEW_SECONDS;
    }
    if (res.status() >= 500) {
      console.warn(
        `[auth-storage] Profile probe ${res.status()} at ${sessionPath} — backend unavailable, reusing non-expired JWT`
      );
      const expSec = decodeJwtExpSeconds(token);
      return expSec !== null && expSec > nowSec + JWT_SKEW_SECONDS;
    }
    return res.status() === 200;
  } finally {
    await ctx.dispose();
  }
}

function resolveCredentials(): { email: string; password: string } {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set TEST_EMAIL and TEST_PASSWORD to generate authenticated storage state.');
  }
  return { email, password };
}

/**
 * Returns path to `storage/authenticated-user.json`, reusing it when the session is still valid,
 * otherwise performing API login and regenerating the file.
 */
export async function getAuthenticatedStorageState(): Promise<string> {
  const outPath = getAuthenticatedStorageStatePath();
  const uiBaseUrl = resolveUiBaseUrlForAuthStorage();

  if (!fs.existsSync(outPath)) {
    console.log('[auth-storage] No storage file yet — generating new session');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(outPath, 'utf8');
  } catch (e) {
    console.warn('[auth-storage] Could not read storage file — regenerating', e);
    return regenerateStorage(outPath, uiBaseUrl);
  }

  let parsed: StorageStateFile;
  try {
    parsed = JSON.parse(raw) as StorageStateFile;
  } catch {
    console.warn('[auth-storage] Invalid storage JSON — regenerating');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  const token = readTokenFromStorageJson(parsed);
  if (!token) {
    console.log('[auth-storage] No token in storage file — new session generated');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  const exp = decodeJwtExpSeconds(token);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp !== null && exp <= nowSec + JWT_SKEW_SECONDS) {
    console.log('[auth-storage] Session expired (JWT exp) — regenerating');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  const apiOk = await isAccessTokenAcceptedByApi(token);
  if (!apiOk) {
    console.log('[auth-storage] Session rejected by API (expired or revoked) — regenerating');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  if (!readAuthSessionSeed()) {
    console.log('[auth-storage] Missing session seed file — regenerating');
    return regenerateStorage(outPath, uiBaseUrl);
  }

  console.log('[auth-storage] Existing session reused:', outPath);
  return outPath;
}

async function regenerateStorage(outPath: string, uiBaseUrl: string): Promise<string> {
  const { email, password } = resolveCredentials();
  const ctx = await playwrightRequest.newContext();
  try {
    const runOnce = async () => {
      const body = toLoginApiResponse(await loginByApi(ctx, email, password));
      const token = extractTokenFromLoginBody(body);
      if (!token) {
        throw new Error('[auth-storage] Login succeeded but no bearer token found in response body');
      }
      await generateAuthenticatedStorageInBrowser(outPath, uiBaseUrl, body, email, password);
    };

    try {
      await runOnce();
    } catch (seedErr) {
      console.warn('[auth-storage] Full browser auth generation failed once; fresh API login then retry', seedErr);
      const delayMs = Number(process.env.AUTH_SEED_RETRY_DELAY_MS);
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else if (process.env.CI) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      await runOnce();
    }
    console.log('[auth-storage] New session generated:', outPath);
    return outPath;
  } finally {
    await ctx.dispose();
  }
}
