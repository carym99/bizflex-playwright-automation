import 'dotenv/config';
import * as path from 'path';
import { generateAuthStorageState } from './authStorage';

const BASE_URL_UI = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL;

function resolveCredentials(): { email: string; password: string } {
  const email =
    process.env.TEST_EMAIL ||
    process.env.AUTH_API_SUCCESS_EMAIL ||
    process.env.AUTH_UI_SUCCESS_EMAIL ||
    process.env.AUTH_EMAIL;
  const password =
    process.env.TEST_PASSWORD ||
    process.env.AUTH_API_SUCCESS_PASSWORD ||
    process.env.AUTH_UI_SUCCESS_PASSWORD ||
    process.env.AUTH_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Set TEST_EMAIL and TEST_PASSWORD (or AUTH_API_SUCCESS_* ) in playwright/.env — see .env.example'
    );
  }
  return { email, password };
}

/**
 * API login once, seed localStorage like Cypress seedAuthTokensInWindow, persist storage state.
 */
export async function generateStorageState(): Promise<void> {
  const { email, password } = resolveCredentials();
  if (!BASE_URL_UI) {
    throw new Error('Set BASE_URL (or PLAYWRIGHT_BASE_URL) in env.');
  }

  const storagePath = path.join(__dirname, '..', 'storage', 'auth.json');
  await generateAuthStorageState(email, password, BASE_URL_UI, storagePath);
}

generateStorageState().catch((err) => {
  console.error(err);
  process.exit(1);
});
