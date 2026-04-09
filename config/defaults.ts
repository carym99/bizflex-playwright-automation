/**
 * Shared environment defaults for Playwright auth flows.
 */
export const PAGE_LOAD_TIMEOUT_MS = 45_000;

export function getApiBaseUrl(): string {
  const raw = process.env.API_URL || process.env.CYPRESS_apiUrl;
  if (!raw) {
    throw new Error('Missing API_URL (or CYPRESS_apiUrl). Set in .env.local / CI secrets.');
  }
  return raw.replace(/\/$/, '');
}

export function getUiBaseUrl(): string {
  const raw = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL;
  if (!raw) {
    throw new Error('Missing BASE_URL (or PLAYWRIGHT_BASE_URL). Set in .env.local / CI secrets.');
  }
  return raw.replace(/\/$/, '');
}

