import type { APIRequestContext } from '@playwright/test';
import { resolveApiUrl } from '../utils/api';
import {
  parseAccountsFromApiBody,
  type AccountApiRecord,
} from '../support/ui/accountContextApi';

const profilePath = () => process.env.AUTH_SESSION_PATH || '/v1/users/profile';

const contextsPaths = (): string[] => {
  const fromEnv = process.env.ACCOUNT_CONTEXTS_PATH?.trim();
  if (fromEnv) return [fromEnv];
  return ['/v1/users/contexts', '/v1/account/contexts', '/v1/users/account/contexts'];
};

export type AccountApiSnapshot = {
  profileStatus: number;
  contextsStatus: number;
  contextsPathUsed?: string;
  profileRecords: AccountApiRecord[];
  contextsRecords: AccountApiRecord[];
  allRecords: AccountApiRecord[];
};

export async function fetchAccountApiSnapshot(
  request: APIRequestContext,
  token: string
): Promise<AccountApiSnapshot> {
  const headers = { Authorization: `Bearer ${token}`, Accept: '*/*' };

  const profileRes = await request.get(resolveApiUrl(profilePath()), {
    headers,
    failOnStatusCode: false,
  });
  const profileBody = await profileRes.json().catch(() => ({}));
  const profileRecords = profileRes.ok() ? parseAccountsFromApiBody(profileBody) : [];

  let contextsStatus = 0;
  let contextsPathUsed: string | undefined;
  let contextsRecords: AccountApiRecord[] = [];

  for (const path of contextsPaths()) {
    const res = await request.get(resolveApiUrl(path), { headers, failOnStatusCode: false });
    contextsStatus = res.status();
    if (res.ok()) {
      contextsPathUsed = path;
      const body = await res.json().catch(() => ({}));
      contextsRecords = parseAccountsFromApiBody(body);
      break;
    }
  }

  const byKey = new Map<string, AccountApiRecord>();
  for (const r of [...contextsRecords, ...profileRecords]) {
    const key = r.accountContextId || r.id || r.accountName || JSON.stringify(r);
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, r);
    else byKey.set(key, { ...existing, ...r });
  }

  return {
    profileStatus: profileRes.status(),
    contextsStatus,
    contextsPathUsed,
    profileRecords,
    contextsRecords,
    allRecords: [...byKey.values()],
  };
}
