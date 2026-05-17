/**
 * Account context for post-login `/select-account` and dashboard setup.
 * All account identifiers come from env — never hardcode display names in specs.
 */

export type AccountType = 'freelance' | 'business';

/** Canonical test type: freelance covers API `individual` and UI label Freelancer. */
export function normalizeAccountType(raw: string | undefined | null): AccountType | undefined {
  if (raw == null || String(raw).trim() === '') return undefined;
  const t = String(raw).trim().toLowerCase();
  if (t === 'freelance' || t === 'freelancer' || t === 'individual') return 'freelance';
  if (t === 'business') return 'business';
  return undefined;
}

/** True when requested test type matches API/UI raw type (freelance ↔ individual). */
export function accountTypesMatch(
  requested: AccountType | undefined,
  apiOrUiRawType: string | undefined
): boolean {
  if (!requested) return true;
  return normalizeAccountType(apiOrUiRawType) === requested;
}

/** UI picker labels use "Freelancer" for freelance accounts. */
export function uiLabelMatchesAccountType(uiLabel: string, requested: AccountType): boolean {
  const normalized = normalizeAccountType(uiLabel);
  if (normalized) return normalized === requested;
  if (requested === 'freelance') return /freelancer/i.test(uiLabel);
  if (requested === 'business') return /business/i.test(uiLabel);
  return false;
}

export function targetRequiresStableApiIdentifiers(opts: AccountSelectOptions): boolean {
  return Boolean(opts.accountContextId || opts.accountId || opts.businessId || opts.walletId);
}

/** Options passed to login / select-account helpers and Playwright fixtures. */
export interface AccountSelectOptions {
  accountType?: AccountType;
  /** UI display name (loose match — ignores extra/missing spaces vs API). */
  accountName?: string;
  /** Account id from /profile or /contexts (data-testid: select-account-option-{id}). */
  accountId?: string;
  /** accountContextId from API (data-testid: select-account-context-{uuid}). */
  accountContextId?: string;
  businessId?: string;
  walletId?: string;
  preferLastUsed?: boolean;
}

export type ResolvedAccountSelectOptions = AccountSelectOptions;

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Normalize for loose name match (e.g. "Imperial Leather Soap" vs "Imperial LeatherSoap"). */
export function normalizeAccountDisplayName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

export function accountNamesMatchLoosely(a: string, b: string): boolean {
  const na = normalizeAccountDisplayName(a);
  const nb = normalizeAccountDisplayName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function hasAccountTargetConfig(opts: AccountSelectOptions): boolean {
  return Boolean(
    opts.accountId ||
      opts.accountContextId ||
      opts.accountName ||
      opts.businessId ||
      opts.walletId
  );
}

export function requireFreelanceEnv(): AccountSelectOptions {
  return {
    accountType: 'freelance',
    accountName: envTrim('E2E_FREELANCE_ACCOUNT_NAME'),
    accountId: envTrim('E2E_FREELANCE_ACCOUNT_ID'),
    accountContextId: envTrim('E2E_FREELANCE_ACCOUNT_CONTEXT_ID'),
    businessId: envTrim('E2E_FREELANCE_BUSINESS_ID'),
    walletId: envTrim('E2E_FREELANCE_WALLET_ID'),
  };
}

export function requireBusinessEnv(slot: 'default' | 'secondary' = 'default'): AccountSelectOptions {
  if (slot === 'secondary') {
    return {
      accountType: 'business',
      accountName: envTrim('E2E_BUSINESS_ACCOUNT_NAME_2'),
      accountId: envTrim('E2E_BUSINESS_ACCOUNT_ID_2'),
      accountContextId: envTrim('E2E_BUSINESS_ACCOUNT_CONTEXT_ID_2'),
      businessId: envTrim('E2E_BUSINESS_ID_2'),
      walletId: envTrim('E2E_BUSINESS_WALLET_ID_2'),
    };
  }
  return {
    accountType: 'business',
    accountName: envTrim('E2E_BUSINESS_ACCOUNT_NAME'),
    accountId: envTrim('E2E_BUSINESS_ACCOUNT_ID'),
    accountContextId: envTrim('E2E_BUSINESS_ACCOUNT_CONTEXT_ID'),
    businessId: envTrim('E2E_BUSINESS_ID'),
    walletId: envTrim('E2E_BUSINESS_WALLET_ID'),
  };
}

export function freelanceEnvSkipReason(): string | null {
  const o = requireFreelanceEnv();
  if (hasAccountTargetConfig(o)) return null;
  return 'Set E2E_FREELANCE_ACCOUNT_ID, E2E_FREELANCE_ACCOUNT_CONTEXT_ID, and/or E2E_FREELANCE_ACCOUNT_NAME';
}

export function businessEnvSkipReason(slot: 'default' | 'secondary' = 'default'): string | null {
  const o = requireBusinessEnv(slot);
  if (hasAccountTargetConfig(o)) return null;
  const prefix = slot === 'secondary' ? 'E2E_BUSINESS_*_2' : 'E2E_BUSINESS_*';
  return `Set ${prefix} (ACCOUNT_NAME, ACCOUNT_ID, ACCOUNT_CONTEXT_ID, BUSINESS_ID, or WALLET_ID)`;
}

/** Default account for storage generation (`npm run auth`) when tests do not override. */
export function resolveDefaultAccountContextFromEnv(): AccountSelectOptions {
  const accountId =
    envTrim('E2E_SELECT_ACCOUNT_ID') || envTrim('E2E_DEFAULT_ACCOUNT_ID');
  const accountName =
    envTrim('E2E_SELECT_ACCOUNT_NAME') ||
    envTrim('E2E_DEFAULT_ACCOUNT_NAME');
  const rawType = envTrim('E2E_SELECT_ACCOUNT_TYPE')?.toLowerCase();
  let accountType: AccountType | undefined;
  if (rawType === 'freelance' || rawType === 'freelancer' || rawType === 'individual') {
    accountType = 'freelance';
  } else if (rawType === 'business') {
    accountType = 'business';
  }

  return {
    accountId,
    accountName,
    accountType,
    accountContextId:
      envTrim('E2E_SELECT_ACCOUNT_CONTEXT_ID') ||
      envTrim('E2E_DEFAULT_ACCOUNT_CONTEXT_ID') ||
      (accountType === 'freelance'
        ? envTrim('E2E_FREELANCE_ACCOUNT_CONTEXT_ID')
        : accountType === 'business'
          ? envTrim('E2E_BUSINESS_ACCOUNT_CONTEXT_ID')
          : undefined),
    preferLastUsed: envTrim('E2E_PREFER_LAST_USED_ACCOUNT') === '1',
  };
}

export function resolveFreelanceAccountContextFromEnv(): AccountSelectOptions {
  return requireFreelanceEnv();
}

export function resolveBusinessAccountContextFromEnv(
  businessKey: 'default' | 'secondary' = 'default'
): AccountSelectOptions {
  return requireBusinessEnv(businessKey);
}

export function mergeAccountSelectOptions(
  explicit?: AccountSelectOptions
): ResolvedAccountSelectOptions {
  const fromEnv = resolveDefaultAccountContextFromEnv();
  return {
    preferLastUsed: explicit?.preferLastUsed ?? fromEnv.preferLastUsed,
    accountType: explicit?.accountType ?? fromEnv.accountType,
    accountName: explicit?.accountName ?? fromEnv.accountName,
    accountId: explicit?.accountId ?? fromEnv.accountId,
    accountContextId: explicit?.accountContextId ?? fromEnv.accountContextId,
    businessId: explicit?.businessId ?? fromEnv.businessId,
    walletId: explicit?.walletId ?? fromEnv.walletId,
  };
}

export function describeAccountSelectOptions(opts: ResolvedAccountSelectOptions): string {
  const parts: string[] = [];
  if (opts.accountType) parts.push(`type=${opts.accountType}`);
  if (opts.accountName) parts.push(`name~="${opts.accountName}"`);
  if (opts.accountId) parts.push(`accountId=${opts.accountId}`);
  if (opts.accountContextId) parts.push(`contextId=${opts.accountContextId}`);
  if (opts.businessId) parts.push(`businessId=${opts.businessId}`);
  if (opts.walletId) parts.push(`walletId=${opts.walletId}`);
  if (opts.preferLastUsed) parts.push('preferLastUsed');
  return parts.length ? parts.join(', ') : '(no account target configured)';
}
