import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import { getAuthenticatedStorageState } from './storageState';

loadEnv({ path: path.join(__dirname, '..', '..', '.env.local') });
loadEnv({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * Ensures `storage/authenticated-user.json` exists before UI tests run (CI-safe).
 */
export default async function globalSetup(): Promise<void> {
  try {
    await getAuthenticatedStorageState();
  } catch (err) {
    console.error('[global-setup] Failed to prepare authenticated storage:', err);
    throw err;
  }
}
