import { test, expect, type APIRequestContext } from '@playwright/test';
import { resolveApiUrl } from '../../utils/api';
import { getValidEmail, getValidPassword, getLoginPath } from '../../fixtures/auth.fixture';
import { asRecord, assertFailureContract, assertNoSensitiveFields } from '../../helpers/responseValidator';

const logoutPath = process.env.AUTH_LOGOUT_PATH || '/v1/auth/logout';
const profilePath = process.env.AUTH_SESSION_PATH || '/v1/users/profile';

async function loginForAccessToken(request: APIRequestContext) {
  const response = await request.post(resolveApiUrl(getLoginPath()), {
    data: { email: getValidEmail(), password: getValidPassword() },
    headers: { Accept: '*/*', 'Content-Type': 'application/json' },
  });
  const body = asRecord(await response.json().catch(() => ({})));
  return {
    response,
    accessToken: String(body.accessToken || body.token || ''),
    refreshToken: String(body.refreshToken || ''),
  };
}

test.describe('@api @auth @security Logout API', () => {
  test('logout invalidates access token for protected session endpoint', async ({ request }) => {
    test.skip(!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD, 'Set TEST_EMAIL and TEST_PASSWORD');
    const login = await loginForAccessToken(request);
    expect(login.response.status()).toBe(200);
    expect(login.accessToken.length).toBeGreaterThan(0);

    const logout = await request.post(resolveApiUrl(logoutPath), {
      data: { refreshToken: login.refreshToken || undefined },
      headers: { Authorization: `Bearer ${login.accessToken}` },
      failOnStatusCode: false,
    });
    test.skip(logout.status() === 404, `Logout endpoint not available at ${logoutPath}`);
    expect([200, 201, 202, 204]).toContain(logout.status());
    assertNoSensitiveFields(await logout.json().catch(() => ({})));

    const sessionAfterLogout = await request.get(resolveApiUrl(profilePath), {
      headers: { Authorization: `Bearer ${login.accessToken}` },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(sessionAfterLogout.status());
    assertFailureContract(await sessionAfterLogout.json().catch(() => ({})));
  });
});

