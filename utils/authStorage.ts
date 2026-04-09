import { chromium, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  extractRefreshTokenFromLoginBody,
  extractTokenFromLoginBody,
  extractUserFromLoginBody,
  loginViaApi,
} from './api';

/**
 * Persist Playwright storage state from an API login JSON body (token + optional user).
 * Used by API-based session generation and `support/auth/storageState.ts`.
 */
export async function persistStorageStateFromLoginBody(
  loginBody: unknown,
  uiBaseUrl: string,
  outputPath: string
): Promise<string> {
  const token = extractTokenFromLoginBody(loginBody);
  if (!token) {
    throw new Error('Login response did not include token/accessToken.');
  }

  const refreshToken = extractRefreshTokenFromLoginBody(loginBody) ?? '';
  const user = extractUserFromLoginBody(loginBody);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    await seedStorageContext(context, uiBaseUrl, {
      accessToken: token,
      refreshToken,
      user,
    });
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await context.storageState({ path: outputPath });
    return outputPath;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Generate storage JSON from API login for session-injected flows.
 * Mirrors Cypress-style localStorage token seeding.
 */
export async function generateAuthStorageState(
  email: string,
  password: string,
  uiBaseUrl: string,
  outputPath = path.join(__dirname, '..', 'storage', 'auth.json')
): Promise<string> {
  const loginBody = await loginViaApi(email, password);
  return persistStorageStateFromLoginBody(loginBody, uiBaseUrl, outputPath);
}

export type BrowserAuthLocalSeed = {
  accessToken: string;
  refreshToken: string;
  user: unknown | null;
};

/**
 * Seeds BizFlex SPA auth keys on the **UI origin** (e.g. Netlify), then callers persist `storageState`.
 */
export async function seedStorageContext(
  context: BrowserContext,
  uiBaseUrl: string,
  auth: BrowserAuthLocalSeed
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(uiBaseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate((authData) => {
      const t = authData.accessToken;
      window.localStorage.setItem('token', t);
      window.localStorage.setItem('authToken', t);
      window.localStorage.setItem('accessToken', t);
      window.localStorage.setItem('refreshToken', authData.refreshToken ?? '');
      if (authData.user !== null && authData.user !== undefined) {
        window.localStorage.setItem('user', JSON.stringify(authData.user));
      }
    }, auth);
  } finally {
    await page.close();
  }
}

