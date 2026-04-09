import 'dotenv/config';
import { getAuthenticatedStorageState } from '../support/auth/storageState';

/**
 * CLI: refresh `storage/authenticated-user.json` (same pipeline as Playwright globalSetup).
 */
getAuthenticatedStorageState().catch((err) => {
  console.error(err);
  process.exit(1);
});
