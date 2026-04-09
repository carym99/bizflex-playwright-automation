import type { APIRequestContext } from '@playwright/test';
import {
  resolveApiUrl,
  extractTokenFromLoginBody,
  extractRefreshTokenFromLoginBody,
  extractUserFromLoginBody,
} from '../../utils/api';
import type { BrowserAuthLocalSeed } from '../../utils/authStorage';
import { getLoginPath } from '../../fixtures/auth.fixture';

/**
 * Login via the BizFlex auth API using Playwright's request context.
 * Uses API_URL + AUTH_API_LOGIN_PATH (default /v1/auth/login), not BASE_URL,
 * so credentials hit the same backend as existing API specs.
 */
export async function loginByApi(
  requestContext: APIRequestContext,
  email: string,
  password: string
): Promise<unknown> {
  const url = resolveApiUrl(getLoginPath());
  const response = await requestContext.post(url, {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (response.status() !== 200) {
    throw new Error(
      `[loginByApi] HTTP ${response.status} for POST ${url} — ${String(text).slice(0, 500)}`
    );
  }

  return body;
}

/**
 * Maps API login JSON to keys the BizFlex SPA reads from `localStorage` on the UI origin.
 */
export function buildBrowserAuthSeed(loginBody: unknown): BrowserAuthLocalSeed {
  const accessToken = extractTokenFromLoginBody(loginBody);
  if (!accessToken) {
    throw new Error('[loginByApi] Login body has no token/accessToken for browser seed');
  }
  return {
    accessToken,
    refreshToken: extractRefreshTokenFromLoginBody(loginBody) ?? '',
    user: extractUserFromLoginBody(loginBody),
  };
}
