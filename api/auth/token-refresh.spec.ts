/**
 * Refresh token flow: new access token and rotation behavior when implemented.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';
import { getValidEmail, getValidPassword, getLoginPath } from '../../fixtures/auth.fixture';
import { asRecord, assertFailureContract, assertNoSensitiveFields } from '../../helpers/responseValidator';
import { hasTokenPair, isLikelyJwt } from '../../schemas/token.schema';

const strictMode = String(process.env.STRICT_AUTH_CONTRACT || '').toLowerCase() === 'true';
const REFRESH_BUDGET_MS = strictMode ? 1_000 : 3_000;
const refreshPath = process.env.AUTH_REFRESH_PATH || '/v1/auth/refresh-token';

async function loginForTokens(request: APIRequestContext) {
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email: getValidEmail(), password: getValidPassword() },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
  });
  const body = asRecord(await response.json().catch(() => ({})));
  return { response, body };
}

test.describe('@api @auth @security Token refresh', () => {
  test('refresh returns new access token; old refresh invalid after rotation', async ({ request }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Set TEST_EMAIL and TEST_PASSWORD');
    const login = await loginForTokens(request);
    expect(login.response.status()).toBe(200);
    expect(hasTokenPair(login.body)).toBe(true);
    expect(isLikelyJwt(String(login.body.accessToken))).toBe(true);

    const firstRefresh = String(login.body.refreshToken);
    test.skip(!firstRefresh, 'Login response has no refreshToken');

    const started = Date.now();
    const refreshed = await request.post(resolveApiUrl(refreshPath), {
      data: { refreshToken: firstRefresh },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    const durationMs = Date.now() - started;
    test.skip(refreshed.status() === 404, `Refresh endpoint not available at ${refreshPath}`);
    expect([200, 201]).toContain(refreshed.status());
    expect(durationMs).toBeLessThan(REFRESH_BUDGET_MS);

    const refreshedBody = asRecord(await refreshed.json().catch(() => ({})));
    expect(hasTokenPair(refreshedBody)).toBe(true);
    assertNoSensitiveFields(refreshedBody);

    const newAccess = String(refreshedBody.accessToken || '');
    expect(newAccess.length).toBeGreaterThan(0);
    expect(newAccess).not.toBe(String(login.body.accessToken));

    const oldTokenAttempt = await request.post(resolveApiUrl(refreshPath), {
      data: { refreshToken: firstRefresh },
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      failOnStatusCode: false,
    });
    expect([400, 401, 403, 422]).toContain(oldTokenAttempt.status());
    assertFailureContract(await oldTokenAttempt.json().catch(() => ({})));
  });
});
