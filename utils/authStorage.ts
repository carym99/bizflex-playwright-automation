import { chromium, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { extractTokenFromLoginBody, extractUserFromLoginBody, loginViaApi } from './api';

/**
 * Generate storage/auth.json from API login for session-injected flows.
 * Mirrors Cypress-style localStorage token seeding.
 */
export async function generateAuthStorageState(
  email: string,
  password: string,
  uiBaseUrl: string,
  outputPath = path.join(__dirname, '..', 'storage', 'auth.json')
): Promise<string> {
  const loginBody = await loginViaApi(email, password);
  const token = extractTokenFromLoginBody(loginBody);
  if (!token) {
    throw new Error('Login response did not include token/accessToken.');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    await seedStorageContext(context, uiBaseUrl, token, extractUserFromLoginBody(loginBody));
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await context.storageState({ path: outputPath });
    return outputPath;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function seedStorageContext(
  context: BrowserContext,
  uiBaseUrl: string,
  token: string,
  user: unknown
): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(uiBaseUrl, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ t, u }) => {
        window.localStorage.setItem('token', t);
        window.localStorage.setItem('authToken', t);
        window.localStorage.setItem('accessToken', t);
        if (u !== null && u !== undefined) {
          window.localStorage.setItem('user', JSON.stringify(u));
        }
      },
      { t: token, u: user ?? null }
    );
  } finally {
    await page.close();
  }
}

