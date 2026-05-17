import { expect, type APIRequestContext } from '@playwright/test';
import { extractTokenFromLoginBody, resolveApiUrl } from '../utils/api';
import { getLoginPath, getValidEmail, getValidPassword } from '../fixtures/auth.fixture';

/** Login for API regression specs that use `getValidEmail` / `getValidPassword`. */
export async function loginForAccessToken(request: APIRequestContext): Promise<string> {
  const email = getValidEmail();
  const password = getValidPassword();
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email, password },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
    failOnStatusCode: false,
  });
  expect(response.status(), 'Login must succeed to obtain bearer token').toBe(200);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const token = extractTokenFromLoginBody(body);
  expect(token, 'Login response missing access token').toBeTruthy();
  return String(token);
}
