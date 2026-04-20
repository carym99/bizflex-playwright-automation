import type { Page, TestInfo } from '@playwright/test';

export type AuthStateDiagnostics = {
  url: string;
  cookies: Array<{ name: string; domain: string; path: string; httpOnly?: boolean }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  hasTokenLikeKey: boolean;
};

const TOKEN_LIKE_KEYS = ['token', 'accessToken', 'authToken', 'refreshToken'];

function summarizeCookies(page: Page) {
  return page.context().cookies();
}

/**
 * Collects URL, cookies, and storage dumps for CI / trace debugging.
 */
export async function collectAuthDiagnostics(page: Page): Promise<AuthStateDiagnostics> {
  const url = page.url();
  const cookiesRaw = await summarizeCookies(page);
  const cookies = cookiesRaw.map((c) => ({
    name: c.name,
    domain: c.domain,
    path: c.path,
    httpOnly: c.httpOnly,
  }));

  const { localStorage, sessionStorage, localStorageKeys, sessionStorageKeys } = await page.evaluate(() => {
    const ls: Record<string, string> = {};
    const lsk: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) {
        lsk.push(k);
        ls[k] = window.localStorage.getItem(k) ?? '';
      }
    }
    const ss: Record<string, string> = {};
    const ssk: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k) {
        ssk.push(k);
        ss[k] = window.sessionStorage.getItem(k) ?? '';
      }
    }
    return {
      localStorage: ls,
      sessionStorage: ss,
      localStorageKeys: lsk,
      sessionStorageKeys: ssk,
    };
  });

  let hasTokenLikeKey = TOKEN_LIKE_KEYS.some(
    (k) =>
      Object.prototype.hasOwnProperty.call(localStorage, k) &&
      typeof localStorage[k] === 'string' &&
      localStorage[k].length > 0
  );
  if (!hasTokenLikeKey && typeof sessionStorage.user === 'string' && sessionStorage.user.length > 10) {
    try {
      const u = JSON.parse(sessionStorage.user) as { accessToken?: unknown };
      hasTokenLikeKey = typeof u.accessToken === 'string' && u.accessToken.length > 10;
    } catch {
      /* ignore */
    }
  }

  return {
    url,
    cookies,
    localStorage,
    sessionStorage,
    localStorageKeys,
    sessionStorageKeys,
    hasTokenLikeKey,
  };
}

export async function logAuthDiagnostics(page: Page, label: string): Promise<AuthStateDiagnostics> {
  const diag = await collectAuthDiagnostics(page);
  console.error(`[auth-debug] ${label}`, JSON.stringify(diag, null, 2));
  if (!diag.hasTokenLikeKey) {
    console.error('[auth-debug] Missing expected localStorage token keys (token / accessToken / authToken / refreshToken)');
  }
  return diag;
}

/**
 * Attach JSON + screenshot when a test unexpectedly hits the login route.
 */
function redactSecrets(diag: AuthStateDiagnostics): AuthStateDiagnostics {
  const redactMap = (m: Record<string, string>) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(m)) {
      const lower = k.toLowerCase();
      if (/token|secret|password|auth/i.test(lower) && v.length > 8) {
        o[k] = `[redacted:${v.length} chars]`;
      } else {
        o[k] = v.length > 500 ? `${v.slice(0, 500)}…` : v;
      }
    }
    return o;
  };
  return {
    ...diag,
    localStorage: redactMap(diag.localStorage),
    sessionStorage: redactMap(diag.sessionStorage),
  };
}

export async function attachAuthFailureArtifacts(
  page: Page,
  testInfo: TestInfo,
  reason: string
): Promise<AuthStateDiagnostics> {
  const diag = await logAuthDiagnostics(page, reason);
  await testInfo.attach('auth-diagnostics.json', {
    body: Buffer.from(JSON.stringify(redactSecrets(diag), null, 2), 'utf8'),
    contentType: 'application/json',
  });
  await testInfo.attach('auth-failure-screenshot.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  return diag;
}
