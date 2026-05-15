/**
 * Account context for post-login `/select-account` and dashboard setup.
 * Credentials stay in env; account targeting uses name, id, or type — never "first row" without fallback env.
 */

export type AccountType = 'freelance' | 'business';

/** Options passed to login / select-account helpers and Playwright fixtures. */
export interface AccountSelectOptions {
  accountType?: AccountType;
  /** Substring match on the picker card accessible name (e.g. "France Spain"). */
  accountName?: string;
  /** Matches data-testid="select-account-option-{id}" when present in the app. */
  accountId?: string;
  /** Prefer the card marked LAST USED when type/name/id are unset. */
  preferLastUsed?: boolean;
}

export type ResolvedAccountSelectOptions = AccountSelectOptions & {
  accountType?: AccountType;
};

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Default account for storage generation (`npm run auth`) and chromium project when tests do not override. */
export function resolveDefaultAccountContextFromEnv(): AccountSelectOptions {
  const accountId = envTrim('E2E_DEFAULT_ACCOUNT_ID');
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
    preferLastUsed: envTrim('E2E_PREFER_LAST_USED_ACCOUNT') === '1',
  };
}

/** Preset freelance context from `E2E_FREELANCE_ACCOUNT_NAME` / `E2E_FREELANCE_ACCOUNT_ID`. */
export function resolveFreelanceAccountContextFromEnv(): AccountSelectOptions {
  return {
    accountType: 'freelance',
    accountName: envTrim('E2E_FREELANCE_ACCOUNT_NAME'),
    accountId: envTrim('E2E_FREELANCE_ACCOUNT_ID'),
  };
}

/** Preset business context from `E2E_BUSINESS_ACCOUNT_NAME` / `E2E_BUSINESS_ACCOUNT_ID` (or generic business env). */
export function resolveBusinessAccountContextFromEnv(
  businessKey: 'default' | 'secondary' = 'default'
): AccountSelectOptions {
  if (businessKey === 'secondary') {
    return {
      accountType: 'business',
      accountName: envTrim('E2E_BUSINESS_ACCOUNT_NAME_2'),
      accountId: envTrim('E2E_BUSINESS_ACCOUNT_ID_2'),
    };
  }
  return {
    accountType: 'business',
    accountName:
      envTrim('E2E_BUSINESS_ACCOUNT_NAME') ||
      envTrim('E2E_SELECT_ACCOUNT_NAME'),
    accountId: envTrim('E2E_BUSINESS_ACCOUNT_ID') || envTrim('E2E_DEFAULT_ACCOUNT_ID'),
  };
}

/**
 * Merge explicit test options over env defaults. Explicit wins.
 */
export function mergeAccountSelectOptions(
  explicit?: AccountSelectOptions
): ResolvedAccountSelectOptions {
  const fromEnv = resolveDefaultAccountContextFromEnv();
  return {
    preferLastUsed: explicit?.preferLastUsed ?? fromEnv.preferLastUsed,
    accountType: explicit?.accountType ?? fromEnv.accountType,
    accountName: explicit?.accountName ?? fromEnv.accountName,
    accountId: explicit?.accountId ?? fromEnv.accountId,
  };
}

export function describeAccountSelectOptions(opts: ResolvedAccountSelectOptions): string {
  const parts: string[] = [];
  if (opts.accountType) parts.push(`type=${opts.accountType}`);
  if (opts.accountName) parts.push(`name~="${opts.accountName}"`);
  if (opts.accountId) parts.push(`id=${opts.accountId}`);
  if (opts.preferLastUsed) parts.push('preferLastUsed');
  return parts.length ? parts.join(', ') : '(env default / last-used / first matching tile)';
}
