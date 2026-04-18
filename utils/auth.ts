import 'dotenv/config';
import { duplicateCanonicalAuthStorageToWorkerFiles, getAuthenticatedStorageState } from '../support/auth/storageState';

/**
 * CLI: refresh `storage/authenticated-user.json` and clone to worker slot files (same pipeline as setup project).
 */
getAuthenticatedStorageState()
  .then(() => duplicateCanonicalAuthStorageToWorkerFiles())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
