import * as fs from 'fs';
import * as path from 'path';
import { chromium, request as playwrightRequest } from '@playwright/test';
import { resolveApiUrl, extractTokenFromLoginBody } from '../../utils/api';
import { persistStorageStateFromLoginBody } from '../../utils/authStorage';
import { isLikelyJwt } from '../../schemas/token.schema';
import { logAuthDiagnostics } from './debugAuthState';
import { loginByApi } from './loginByApi';

const STORAGE_FILENAME = 'authenticated-user.json';

/**
 * UI origin for `localStorage` / `storageState` must match the deployed SPA (e.g. Netlify),
 * not the API host — otherwise injected tokens never apply in the browser.
 */
function resolveUiBaseUrlForAuthStorage(): string {
  const raw =
    process.env.BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'https://bizflex-app.netlify.app';
  return raw.replace(/\/$/, '');
}

async function validateSeededStorageAllowsAccount(outPath: string, uiBaseUrl: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      storageState: outPath,
      baseURL: uiBaseUrl,
    });
    const page = await context.newPage();
    try {
      await page.goto('/account', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load');
      await page
        .waitForFunction(
          () => {
            const p = window.location.pathname.toLowerCase();
            return p.includes('account') || p.includes('login');
          },
          { timeout: 25_000 }
        )
        .catch(() => {});

      const url = page.url();
      if (/\/login/i.test(url)) {
        console.error('[auth-storage] Redirected to login despite seeded auth — URL:', url);
        await logAuthDiagnostics(page, 'post-seed validation');
        throw new Error(
          'Seeded storageState redirected to /login. Confirm BASE_URL matches the SPA origin and login API returns tokens the app expects.'
        );
      }
      if (!/\/account/i.test(url)) {
        console.warn('[auth-storage] Unexpected URL after navigating to /account:', url);
      }
      console.log('[auth-storage] Auth state seeded successfully — /account did not redirect to login');
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

  if (!fs.existsSync(outPath)) {
    console.log('[auth-storage] No storage file yet — generating new session');
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  let raw: string;
  try {
    raw = fs.readFileSync(outPath, 'utf8');
  } catch (e) {
    console.warn('[auth-storage] Could not read storage file — regenerating', e);
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  let parsed: StorageStateFile;
  try {
    parsed = JSON.parse(raw) as StorageStateFile;
  } catch {
    console.warn('[auth-storage] Invalid storage JSON — regenerating');
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  const token = readTokenFromStorageJson(parsed);
  if (!token) {
    console.log('[auth-storage] No token in storage file — new session generated');
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  const exp = decodeJwtExpSeconds(token);
  const nowSec = Math.floor(Date.now() / 1000);
  if (exp !== null && exp <= nowSec + JWT_SKEW_SECONDS) {
    console.log('[auth-storage] Session expired (JWT exp) — regenerating');
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  const apiOk = await isAccessTokenAcceptedByApi(token);
  if (!apiOk) {
    console.log('[auth-storage] Session rejected by API (expired or revoked) — regenerating');
    return regenerateStorage(outPath, resolveUiBaseUrlForAuthStorage());
  }

  console.log('[auth-storage] Existing session reused:', outPath);
  return outPath;
}

async function regenerateStorage(outPath: string, uiBaseUrl: string): Promise<string> {
  const { email, password } = resolveCredentials();
  const ctx = await playwrightRequest.newContext();
  try {
    const body = await loginByApi(ctx, email, password);
    const token = extractTokenFromLoginBody(body);
    if (!token) {
      throw new Error('[auth-storage] Login succeeded but no bearer token found in response body');
    }
    await persistStorageStateFromLoginBody(body, uiBaseUrl, outPath);
    await validateSeededStorageAllowsAccount(outPath, uiBaseUrl);
    console.log('[auth-storage] New session generated:', outPath);
    return outPath;
  } finally {
    await ctx.dispose();
  }
}
