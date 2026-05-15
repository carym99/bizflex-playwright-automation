import type { Request, Response } from '@playwright/test';
import { getLoginPath } from '../fixtures/auth.fixture';

function apiOrigin(): string | null {
  const raw = process.env.API_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  const p = pathname.toLowerCase();
  return p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p;
}

/** Configured login path from env (default `/v1/auth/login`). */
function configuredLoginPathname(): string {
  const raw = getLoginPath().trim();
  try {
    if (raw.startsWith('http')) return normalizePathname(new URL(raw).pathname);
  } catch {
    /* relative path */
  }
  return normalizePathname(raw.startsWith('/') ? raw : `/${raw}`);
}

/**
 * True when URL looks like a BizFlex **API** login POST target (not the SPA `/login` page).
 */
export function isAuthLoginApiUrl(url: string): boolean {
  let pathname: string;
  let origin: string;
  try {
    const u = new URL(url);
    pathname = normalizePathname(u.pathname);
    origin = u.origin.toLowerCase();
  } catch {
    return false;
  }

  const configured = configuredLoginPathname();
  if (pathname === configured || pathname.endsWith(configured)) {
    return true;
  }

  const knownApiPaths = [
    '/v1/auth/login',
    '/v2/auth/login',
    '/auth/login',
    '/v1/users/login',
    '/v2/users/login',
    '/users/login',
    '/v1/user/login',
    '/v2/user/login',
    '/api/auth/login',
    '/api/v1/auth/login',
    '/api/v2/auth/login',
  ];
  if (knownApiPaths.some((p) => pathname === p || pathname.endsWith(p))) {
    return true;
  }

  if (/\/auth\/login$/i.test(pathname) || /\/v\d+\/auth\/login$/i.test(pathname)) {
    return true;
  }

  if (/\/sign-?in$/i.test(pathname) && /\/(auth|v\d+)\//i.test(pathname)) {
    return true;
  }

  const loginLikePath =
    /\/(v\d+\/)?(auth\/)?login(\/|$)/i.test(pathname) ||
    /\/(v\d+\/)?users?\/login(\/|$)/i.test(pathname) ||
    /\/authenticate(\/|$)/i.test(pathname);

  const api = apiOrigin();
  if (api && origin === api && loginLikePath) {
    return true;
  }

  // SPA may proxy auth to the API (e.g. /v2/auth/login on the Netlify origin)
  const uiBase = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || '';
  try {
    const uiOrigin = new URL(uiBase).origin.toLowerCase();
    if (origin === uiOrigin && loginLikePath) {
      return true;
    }
  } catch {
    /* ignore */
  }

  // SPA route only — not an API login call
  if (/^\/login(\/|$)/.test(pathname) && !pathname.includes('/auth') && !pathname.includes('/v')) {
    return false;
  }

  return false;
}

export function isAuthLoginRequest(request: Request): boolean {
  if (request.method().toUpperCase() !== 'POST') return false;
  return isAuthLoginApiUrl(request.url());
}

/** Login POST response on the BizFlex API (any status). */
export function isBizflexLoginPostResponse(response: Response): boolean {
  return isAuthLoginRequest(response.request());
}
