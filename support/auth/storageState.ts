import * as fs from 'fs';
import * as path from 'path';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody, extractRefreshTokenFromLoginBody } from '../../utils/api';
import { isLikelyJwt } from '../../schemas/token.schema';
import { logAuthDiagnostics } from './debugAuthState';
import { loginByApi } from './loginByApi';

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

function toSpaOrigin(urlLike: string): string {
  return new URL(urlLike).origin;
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

async function seedBrowserStorageAndSaveState(
  outPath: string,
  uiBaseUrl: string,
  loginResponse: LoginApiResponse
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const spaOrigin = toSpaOrigin(uiBaseUrl);
    const context = await browser.newContext({ baseURL: spaOrigin });
    const page = await context.newPage();
    try {
      const rawBase = process.env.PLAYWRIGHT_BASE_URL || uiBaseUrl;
      const resolvedBaseUrl = new URL(rawBase);
      const spaOriginFromBase = resolvedBaseUrl.origin;
      const initialPath = resolvedBaseUrl.pathname && resolvedBaseUrl.pathname !== '/' ? resolvedBaseUrl.pathname : '/';

      await page.goto(new URL(initialPath, spaOriginFromBase).toString(), {
        waitUntil: 'domcontentloaded',
      });
      const email = process.env.TEST_EMAIL;
      if (!email) {
        throw new Error('[auth-storage] TEST_EMAIL is required to seed sessionStorage.email');
      }

      const accessToken = extractTokenFromLoginBody(loginResponse);
      if (!accessToken) {
        throw new Error('[auth-storage] Login succeeded but no bearer token found in response body');
      }
      const refreshToken = extractRefreshTokenFromLoginBody(loginResponse) ?? '';

      await page.evaluate(
        ({ loginResponse, email }) => {
          const typedResponse = loginResponse as { accessToken?: unknown; refreshToken?: unknown };
          const access = typeof typedResponse.accessToken === 'string' ? typedResponse.accessToken : '';
          const refresh = typeof typedResponse.refreshToken === 'string' ? typedResponse.refreshToken : '';

          localStorage.setItem('token', access);
          localStorage.setItem('accessToken', access);
          localStorage.setItem('authToken', access);
          localStorage.setItem('refreshToken', refresh);

          sessionStorage.setItem('user', JSON.stringify(loginResponse));
          sessionStorage.setItem('email', email);
        },
        {
          loginResponse: { ...loginResponse, accessToken, refreshToken },
          email,
        }
      );

      const debugState = await page.evaluate(() => ({
        localStorage: { ...localStorage },
        sessionStorage: { ...sessionStorage },
      }));

      console.log('[auth-storage] post-seed browser state', JSON.stringify(debugState, null, 2));

      if (!debugState.sessionStorage.user) {
        throw new Error('sessionStorage.user was not set after auth seeding');
      }

      await page.goto(new URL('/account', spaOriginFromBase).toString(), {
        waitUntil: 'domcontentloaded',
      });
      if (/\/login/i.test(page.url())) {
        await logAuthDiagnostics(page, 'seedBrowserStorageAndSaveState /account check');
        throw new Error('Seeded browser session redirected to /login during /account check');
      }

      await persistAuthSessionSeed({ ...loginResponse, accessToken, refreshToken }, email);
      await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
      await context.storageState({ path: outPath });
    } finally {
      await page.close();
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

/** Resolved path to `storage/authenticated-user.json` (project root). */
export function getAuthenticatedStorageStatePath(): string {
  return path.join(__dirname, '..', '..', 'storage', STORAGE_FILENAME);
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
    const body = toLoginApiResponse(await loginByApi(ctx, email, password));
    const token = extractTokenFromLoginBody(body);
    if (!token) {
      throw new Error('[auth-storage] Login succeeded but no bearer token found in response body');
    }
    await seedBrowserStorageAndSaveState(outPath, uiBaseUrl, body);
    console.log('[auth-storage] New session generated:', outPath);
    return outPath;
  } finally {
    await ctx.dispose();
  }
}
