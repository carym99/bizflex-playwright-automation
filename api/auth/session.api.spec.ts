import { test, expect, type APIRequestContext } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';
import { getValidEmail, getValidPassword, getLoginPath } from '../../fixtures/auth.fixture';
import { asRecord, assertFailureContract, assertNoSensitiveFields } from '../../helpers/responseValidator';
import { isLikelyJwt } from '../../schemas/token.schema';

const profilePath = process.env.AUTH_SESSION_PATH || '/v1/users/profile';

async function loginForAccessToken(request: APIRequestContext) {
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email: getValidEmail(), password: getValidPassword() },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
  });
  const body = asRecord(await response.json().catch(() => ({})));
  return { response, accessToken: String(body.accessToken || body.token || '') };
}

test.describe('@api @auth @security Session API', () => {
  test('session endpoint accepts valid token and rejects tampered/invalid tokens', async ({ request }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Set TEST_EMAIL and TEST_PASSWORD');
    const login = await loginForAccessToken(request);
    expect(login.response.status()).toBe(200);
    expect(login.accessToken.length).toBeGreaterThan(0);
    expect(isLikelyJwt(login.accessToken)).toBe(true);

    const validSession = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${login.accessToken}` },
      failOnStatusCode: false,
    });
    test.skip(validSession.status() === 404, `Session endpoint not available at ${profilePath}`);
    expect([200]).toContain(validSession.status());
    assertNoSensitiveFields(await validSession.json().catch(() => ({})));

    const tamperedToken = `${login.accessToken}tampered`;
    const tamperedSession = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${tamperedToken}` },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(tamperedSession.status());
    assertFailureContract(await tamperedSession.json().catch(() => ({})));

    const expiredLikeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid-signature';
    const expiredSession = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${expiredLikeToken}` },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(expiredSession.status());
    assertFailureContract(await expiredSession.json().catch(() => ({})));
  });
});

