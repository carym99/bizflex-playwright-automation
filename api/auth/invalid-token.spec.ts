/**
 * Invalid, tampered, expired, and missing bearer tokens are rejected.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';
import { getValidEmail, getValidPassword, getLoginPath } from '../../fixtures/auth.fixture';
import { asRecord, assertFailureContract } from '../../helpers/responseValidator';
import { isLikelyJwt } from '../../schemas/token.schema';

const profilePath = process.env.AUTH_SESSION_PATH || '/v1/users/profile';

async function skipIfProfileEndpointMissing(request: APIRequestContext) {
  const probe = await request.get(resolveApiUrl(profilePath), { failOnStatusCode: false });
  test.skip(probe.status() === 404, `Session endpoint not available at ${profilePath}`);
}

async function loginForAccessToken(request: APIRequestContext) {
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email: getValidEmail(), password: getValidPassword() },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
  });
  const body = asRecord(await response.json().catch(() => ({})));
  return { response, accessToken: String(body.accessToken || body.token || '') };
}

test.describe('@api @auth @security Invalid token handling', () => {
  test('rejects tampered bearer token', async ({ request }) => {
    await skipIfProfileEndpointMissing(request);
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Set TEST_EMAIL and TEST_PASSWORD');
    const login = await loginForAccessToken(request);
    expect(login.response.status()).toBe(200);
    expect(login.accessToken.length).toBeGreaterThan(0);
    expect(isLikelyJwt(login.accessToken)).toBe(true);

    const tampered = `${login.accessToken}tampered`;
    const res = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${tampered}` },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects syntactically expired / invalid JWT', async ({ request }) => {
    await skipIfProfileEndpointMissing(request);
    const expiredLike =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0IiwiZXhwIjoxfQ.invalid-signature';
    const res = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${expiredLike}` },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
    assertFailureContract(await res.json().catch(() => ({})));
  });

  test('rejects missing Authorization header', async ({ request }) => {
    await skipIfProfileEndpointMissing(request);
    const res = await request.get(resolveApiUrl(profilePath), { failOnStatusCode: false });
    expect([401, 403]).toContain(res.status());
    assertFailureContract(await res.json().catch(() => ({})));
  });
});
