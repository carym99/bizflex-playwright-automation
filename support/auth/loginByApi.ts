import type { APIRequestContext } from '@playwright/test';
import {
  resolveApiUrl,
  extractTokenFromLoginBody,
  extractRefreshTokenFromLoginBody,
  extractUserFromLoginBody,
} from '../../utils/api';
import type { BrowserAuthLocalSeed } from '../../utils/authStorage';
import { getLoginPath } from '../../fixtures/auth.fixture';

const AUTH_NETWORK_RETRY_ATTEMPTS = process.env.CI ? 3 : 2;
const AUTH_NETWORK_RETRY_DELAY_MS = 350;

function isTransientNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toUpperCase();
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('EHOSTUNREACH') ||
    msg.includes('ENOTFOUND')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

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
  let response;
  let lastError: unknown;
  for (let attempt = 1; attempt <= AUTH_NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      response = await requestContext.post(url, {
        data: { email, password },
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        failOnStatusCode: false,
      });
      break;
    } catch (err) {
      lastError = err;
      if (!isTransientNetworkFailure(err) || attempt === AUTH_NETWORK_RETRY_ATTEMPTS) {
        throw err;
      }
      console.warn(
        `[loginByApi] transient network error attempt ${attempt}/${AUTH_NETWORK_RETRY_ATTEMPTS}; retrying`,
        err
      );
      await sleep(AUTH_NETWORK_RETRY_DELAY_MS * attempt);
    }
  }
  if (!response) {
    throw (lastError as Error) ?? new Error('[loginByApi] request failed before receiving a response');
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (response.status() !== 200) {
    throw new Error(
      `[loginByApi] HTTP ${response.status()} for POST ${url} — ${String(text).slice(0, 500)}`
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
