import type { Page } from '@playwright/test';

function isTransientNavigationError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('timeout') || msg.includes('net::err') || msg.includes('navigation');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const defaultNavigationTimeoutMs = process.env.CI ? 90_000 : 45_000;

/**
 * CI-safe goto helper: retries transient navigation failures before surfacing.
 */
export async function gotoWithRetry(
  page: Page,
  url: string,
  options: {
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';
    /** Per-navigation attempt timeout (ms). Defaults to CI-safe budget. */
    timeout?: number;
  } = {}
): Promise<void> {
  const attempts = process.env.CI ? 3 : 2;
  const timeout = options.timeout ?? defaultNavigationTimeoutMs;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    if (page.isClosed()) {
      throw new Error(`[nav] page is closed before goto ${url} (attempt ${i})`);
    }
    try {
      await page.goto(url, {
        waitUntil: options.waitUntil ?? 'domcontentloaded',
        timeout,
      });
      return;
    } catch (err) {
      lastError = err;
      if (!isTransientNavigationError(err) || i === attempts) {
        throw err;
      }
      console.warn(`[nav] goto retry ${i}/${attempts} for ${url}`);
      await sleep(400 * i);
    }
  }
  throw lastError;
}

