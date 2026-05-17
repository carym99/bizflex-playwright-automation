import type { Page, Response } from '@playwright/test';
import {
  accountNamesMatchLoosely,
  accountTypesMatch,
  describeAccountSelectOptions,
  normalizeAccountType,
  targetRequiresStableApiIdentifiers,
  type ResolvedAccountSelectOptions,
} from '../../config/accountContext';

export type AccountApiRecord = {
  id?: string;
  accountName?: string;
  type?: string;
  status?: string;
  accountContextId?: string;
  businessId?: string;
  walletId?: string;
  wallets?: Array<{ id?: string }>;
};

export function isAccountContextsResponseUrl(url: string): boolean {
  return /\/contexts(\?|$|\/)/i.test(url.toLowerCase());
}

export function isUserProfileResponseUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /\/profile(\?|$|\/)/i.test(u) ||
    /\/users\/profile/i.test(u) ||
    /\/v\d+\/users\/profile/i.test(u)
  );
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function stringField(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isNumericId(value: string): boolean {
  return /^\d+$/.test(value);
}

function looksLikeAccountRecord(raw: Record<string, unknown>): boolean {
  return Boolean(
    stringField(raw, 'accountContextId', 'contextId') ||
      stringField(raw, 'id', 'accountId') ||
      stringField(raw, 'accountName', 'name', 'subAccountName') ||
      stringField(raw, 'type', 'accountType')
  );
}

function mapRawAccount(raw: Record<string, unknown>): AccountApiRecord {
  const walletsRaw = raw.wallets;
  const wallets = Array.isArray(walletsRaw)
    ? walletsRaw
        .map((w) => asRecord(w as object))
        .filter((w): w is Record<string, unknown> => Boolean(w))
        .map((w) => ({ id: stringField(w, 'id') }))
    : undefined;

  const walletId =
    stringField(raw, 'walletId') ||
    (wallets?.[0]?.id ? String(wallets[0].id) : undefined);

  const record: AccountApiRecord = {};
  const rawId = stringField(raw, 'id');
  const explicitAccountId = stringField(raw, 'accountId');
  const accountName = stringField(raw, 'accountName', 'name', 'subAccountName');
  const type = stringField(raw, 'type', 'accountType');
  const status = stringField(raw, 'status', 'accountStatus');
  let accountContextId = stringField(raw, 'accountContextId', 'contextId');
  const businessId = stringField(raw, 'businessId');

  let accountId = explicitAccountId;
  if (!accountId && rawId && isNumericId(rawId)) accountId = rawId;
  if (!accountContextId && rawId && isUuid(rawId)) accountContextId = rawId;
  if (!accountId && rawId && !isUuid(rawId)) accountId = rawId;

  if (accountId) record.id = accountId;
  if (accountName) record.accountName = accountName;
  if (type) record.type = type;
  if (status) record.status = status;
  if (accountContextId) record.accountContextId = accountContextId;
  if (businessId) record.businessId = businessId;
  if (walletId) record.walletId = walletId;
  if (wallets?.length) record.wallets = wallets;

  return record;
}

function collectAccountCandidates(value: unknown, out: Record<string, unknown>[], depth = 0): void {
  if (depth > 6 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) collectAccountCandidates(item, out, depth + 1);
    return;
  }

  const rec = asRecord(value);
  if (!rec) return;

  if (looksLikeAccountRecord(rec)) {
    out.push(rec);
  }

  const nestedKeys = [
    'data',
    'accounts',
    'contexts',
    'userAccounts',
    'subAccounts',
    'items',
    'results',
    'account',
    'activeAccount',
    'currentAccount',
  ];
  for (const key of nestedKeys) {
    if (key in rec) collectAccountCandidates(rec[key], out, depth + 1);
  }
}

/** Extract account rows from /contexts or /profile JSON shapes. */
export function parseAccountsFromApiBody(body: unknown): AccountApiRecord[] {
  const candidates: Record<string, unknown>[] = [];
  collectAccountCandidates(body, candidates);

  const seen = new Set<string>();
  const records: AccountApiRecord[] = [];
  for (const raw of candidates) {
    const mapped = mapRawAccount(raw);
    const key =
      mapped.accountContextId ||
      `${mapped.id ?? ''}:${mapped.accountName ?? ''}:${mapped.type ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Object.keys(mapped).length > 0) records.push(mapped);
  }
  return records;
}

function mergeAccountRecords(a: AccountApiRecord, b: AccountApiRecord): AccountApiRecord {
  const out: AccountApiRecord = { ...a };
  for (const [key, value] of Object.entries(b) as [keyof AccountApiRecord, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'id') {
      const incoming = String(value);
      const existing = out.id;
      if (existing && isNumericId(existing) && isUuid(incoming)) continue;
      if (existing && isUuid(existing) && isNumericId(incoming)) {
        out.id = incoming;
        continue;
      }
    }
    (out as Record<string, unknown>)[key as string] = value;
  }
  return out;
}

const captureByPage = new WeakMap<Page, AccountContextApiCapture>();

export class AccountContextApiCapture {
  private contextsRecords: AccountApiRecord[] = [];
  private profileRecords: AccountApiRecord[] = [];
  private contextsOk = false;
  private attached = false;

  allRecords(): AccountApiRecord[] {
    const byKey = new Map<string, AccountApiRecord>();
    // Contexts first; profile merges in numeric account ids without uuid `id` overwriting them.
    for (const r of [...this.contextsRecords, ...this.profileRecords]) {
      const key = r.accountContextId || r.id || r.accountName || JSON.stringify(r);
      const existing = byKey.get(key);
      byKey.set(key, existing ? mergeAccountRecords(existing, r) : r);
    }
    return [...byKey.values()];
  }

  attach(page: Page): void {
    if (this.attached) return;
    this.attached = true;
    page.on('response', (response) => {
      void this.ingest(response);
    });
  }

  private async ingest(response: Response): Promise<void> {
    const url = response.url();
    if (!response.ok()) return;
    try {
      if (isAccountContextsResponseUrl(url)) {
        this.contextsOk = true;
        const body = await response.json();
        this.contextsRecords = parseAccountsFromApiBody(body);
        return;
      }
      if (isUserProfileResponseUrl(url)) {
        const body = await response.json();
        this.profileRecords = parseAccountsFromApiBody(body);
      }
    } catch {
      /* non-JSON */
    }
  }

  hasContextsLoaded(): boolean {
    return this.contextsOk || this.contextsRecords.length > 0;
  }
}

function targetHasMatchCriteria(target: ResolvedAccountSelectOptions): boolean {
  return (
    targetRequiresStableApiIdentifiers(target) ||
    Boolean(target.accountName) ||
    Boolean(target.accountType)
  );
}

/**
 * A record matches when every configured target field matches the same row (AND semantics).
 * Fields missing on /contexts rows are not treated as conflicts (profile-only fields).
 */
export function recordSatisfiesTarget(
  record: AccountApiRecord,
  target: ResolvedAccountSelectOptions
): boolean {
  if (!targetHasMatchCriteria(target)) return false;

  if (target.accountContextId) {
    if (!record.accountContextId || record.accountContextId !== target.accountContextId) return false;
  }
  if (target.accountId && record.id && record.id !== target.accountId) {
    return false;
  }
  if (target.businessId && record.businessId && record.businessId !== target.businessId) {
    return false;
  }
  if (target.walletId && record.walletId && record.walletId !== target.walletId) {
    return false;
  }
  if (
    target.accountName &&
    record.accountName &&
    !accountNamesMatchLoosely(target.accountName, record.accountName)
  ) {
    return false;
  }
  if (target.accountType && record.type && !accountTypesMatch(target.accountType, record.type)) {
    return false;
  }

  const matchedByStableId =
    (target.accountContextId && record.accountContextId === target.accountContextId) ||
    (target.accountId && record.id === target.accountId) ||
    (target.businessId && record.businessId === target.businessId) ||
    (target.walletId && record.walletId === target.walletId);

  const matchedByName =
    target.accountName &&
    record.accountName &&
    accountNamesMatchLoosely(target.accountName, record.accountName);

  const matchedByTypeOnly =
    target.accountType &&
    !target.accountName &&
    !targetRequiresStableApiIdentifiers(target) &&
    accountTypesMatch(target.accountType, record.type);

  return Boolean(matchedByStableId || matchedByName || matchedByTypeOnly);
}

export function findMatchingApiRecords(
  records: AccountApiRecord[],
  target: ResolvedAccountSelectOptions
): AccountApiRecord[] {
  return records.filter((r) => recordSatisfiesTarget(r, target));
}

export function formatAvailableAccountsForError(records: AccountApiRecord[]): string {
  if (records.length === 0) return '(none parsed from /profile or /contexts)';
  return records
    .map((r, i) => {
      const parts = [
        `#${i + 1}`,
        r.id ? `id=${r.id}` : null,
        r.accountName ? `name="${r.accountName}"` : null,
        r.type ? `rawType=${r.type}` : null,
        normalizeAccountType(r.type) ? `normalizedType=${normalizeAccountType(r.type)}` : null,
        r.status ? `status=${r.status}` : null,
        r.accountContextId ? `accountContextId=${r.accountContextId}` : null,
        r.businessId ? `businessId=${r.businessId}` : null,
        r.walletId ? `walletId=${r.walletId}` : null,
      ].filter(Boolean);
      return parts.join(' ');
    })
    .join('\n  ');
}

/**
 * Validates the expected account exists in captured /profile or /contexts data before UI selection.
 */
export function assertExpectedAccountInApiCapture(
  capture: AccountContextApiCapture,
  target: ResolvedAccountSelectOptions
): void {
  const records = capture.allRecords();
  if (records.length === 0) {
    throw new Error(
      `[account-api] No accounts parsed from /profile or /contexts yet. ` +
        `Target: ${describeAccountSelectOptions(target)}`
    );
  }

  if (target.accountContextId) {
    const contextRows = records.filter((r) => r.accountContextId === target.accountContextId);
    if (contextRows.length === 0) {
      throw new Error(
        `[account-api] Expected accountContextId "${target.accountContextId}" not found in /profile or /contexts.\n` +
          `  Available accounts:\n  ${formatAvailableAccountsForError(records)}`
      );
    }
    const strictMatch = findMatchingApiRecords(records, target);
    if (strictMatch.length > 0) return;
    throw new Error(
      `[account-api] accountContextId "${target.accountContextId}" exists but other fields do not match ` +
        `${describeAccountSelectOptions(target)}.\n` +
        `  Matching context row(s):\n  ${formatAvailableAccountsForError(contextRows)}\n` +
        `  All available:\n  ${formatAvailableAccountsForError(records)}`
    );
  }

  const matches = findMatchingApiRecords(records, target);
  if (matches.length > 0) return;

  throw new Error(
    `[account-api] Expected account not found in /profile or /contexts for ${describeAccountSelectOptions(target)}.\n` +
      `  Available accounts:\n  ${formatAvailableAccountsForError(records)}`
  );
}

export function attachAccountContextCapture(page: Page): AccountContextApiCapture {
  let capture = captureByPage.get(page);
  if (!capture) {
    capture = new AccountContextApiCapture();
    capture.attach(page);
    captureByPage.set(page, capture);
  }
  return capture;
}

export function getAccountContextCapture(page: Page): AccountContextApiCapture | undefined {
  return captureByPage.get(page);
}

/** Wait until /profile or /contexts has been parsed (used before pre-select validation). */
export async function waitForAccountApiRecords(
  capture: AccountContextApiCapture,
  options: { timeoutMs?: number } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (capture.allRecords().length > 0) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}
