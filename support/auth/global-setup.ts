import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import { getAuthenticatedStorageState } from './storageState';

loadEnv({ path: path.join(__dirname, '..', '..', '.env.local') });
loadEnv({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * Ensures `storage/authenticated-user.json` exists before UI tests run (CI-safe).
 */
export default async function globalSetup(): Promise<void> {
  const startedAt = Date.now();
  try {
    const apiUrl = process.env.API_URL;
    const spaUrl = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;

    if (!apiUrl) {
      throw new Error('Missing API_URL. Global setup requires API_URL for auth login calls.');
    }
    if (!spaUrl) {
      throw new Error('Missing PLAYWRIGHT_BASE_URL or BASE_URL. Global setup requires a SPA URL for browser seeding.');
    }

    console.log('[global-setup] API login target:', apiUrl);
    console.log('[global-setup] SPA browser target:', spaUrl);
    const storagePath = await getAuthenticatedStorageState();
    console.log('[global-setup] Auth storage ready:', storagePath);
    console.log('[global-setup] Completed in ms:', Date.now() - startedAt);
  } catch (err) {
    console.error('[global-setup] Failed to prepare authenticated storage:', err);
    throw err;
  }
}
