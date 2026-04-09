import type { Request, Response } from '@playwright/test';

function isAuthLoginPath(url: string): boolean {
  const value = url.toLowerCase();
  return (
    value.includes('/v1/auth/login') ||
    value.includes('/auth/login') ||
    /\/login(\?|$|\/)/i.test(value)
  );
}

export function isAuthLoginRequest(request: Request): boolean {
  if (request.method().toUpperCase() !== 'POST') return false;
  return isAuthLoginPath(request.url());
}

/**
 * More specific BizFlex login POST response detector for waits.
 */
export function isBizflexLoginPostResponse(response: Response): boolean {
  const request = response.request();
  return isAuthLoginRequest(request);
}

