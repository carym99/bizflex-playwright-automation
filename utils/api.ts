import axios, { type AxiosResponse } from 'axios';

/**
 * Staging API host — matches cypress.config.js env.apiUrl.
 */
export function resolveApiUrl(resourcePath: string): string {
  const base = (process.env.API_URL || 'https://bizflex.onrender.com').replace(/\/$/, '');
  const p = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return `${base}${p}`;
}

export type ApiLoginBody = Record<string, unknown>;

function unwrapData(body: unknown): ApiLoginBody | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as ApiLoginBody;
  if ('data' in b && b.data !== undefined && typeof b.data === 'object') {
    return b.data as ApiLoginBody;
  }
  return b;
}

function readTokenFields(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const candidates = [o.token, o.accessToken, o.jwt, o.authToken, o.bearerToken, o.sessionToken];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 10) return c;
  }
  return null;
}

/**
 * Extract bearer token from BizFlex-style login JSON (same shapes as Cypress cy.apiLogin).
 */
export function extractTokenFromLoginBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as ApiLoginBody;

  let t = readTokenFields(b);
  if (t) return t;

  const inner = b.data;
  if (inner && typeof inner === 'object') {
    t = readTokenFields(inner);
    if (t) return t;
    const deep = (inner as ApiLoginBody).data;
    if (deep && typeof deep === 'object') {
      t = readTokenFields(deep);
      if (t) return t;
    }
  }

  const unwrapped = unwrapData(body);
  if (unwrapped && unwrapped !== b) {
    t = readTokenFields(unwrapped);
    if (t) return t;
  }

  return null;
}

export function extractUserFromLoginBody(body: unknown): unknown | null {
  const raw = unwrapData(body);
  if (!raw) {
    const top = body as ApiLoginBody | null;
    return (top?.user as unknown) ?? null;
  }
  const u = (raw as { user?: unknown }).user;
  if (u !== undefined) return u;
  const nested = raw as { data?: { user?: unknown } };
  return nested.data?.user ?? null;
}

/**
 * POST /v1/auth/login — same default path as Cypress AUTH_API_LOGIN_PATH.
 */
export async function loginViaApi(email: string, password: string): Promise<unknown> {
  const loginPath = process.env.AUTH_API_LOGIN_PATH || '/v1/auth/login';
  const response: AxiosResponse<unknown> = await axios.post(
    resolveApiUrl(loginPath),
    { email, password },
    {
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    }
  );

  if (response.status !== 200) {
    throw new Error(
      `API login failed: HTTP ${response.status} — ${JSON.stringify(response.data).slice(0, 400)}`
    );
  }

  return response.data;
}
