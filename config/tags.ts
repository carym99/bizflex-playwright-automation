/**
 * Central tag strings for Playwright titles and CI grep.
 * Matrix lanes in GitHub Actions must stay in sync with these values.
 */
export const Tag = {
  smoke: '@smoke',
  auth: '@auth',
  /** Dedicated account-picker gate — run via `npm run test:account-selection:ci`, excluded from generic @auth grep in CI. */
  accountSelection: '@account-selection',
  apiAuth: '@api-auth',
  regression: '@regression',
  payments: '@payments',
  transfers: '@transfers',
  critical: '@critical',
  flaky: '@flaky',
} as const;

export type LaneTag = (typeof Tag)[keyof typeof Tag];

/** One lane → one @-tag (matches `matrix.lane`). */
export const laneToGrep = (lane: 'smoke' | 'auth' | 'api-auth' | 'regression'): string => `@${lane}`;

/**
 * PR fast gate: critical UI/API auth signal without full regression matrix.
 * Account-context product API: one @api-auth profile test only (see account-context.api.spec.ts).
 * Playwright `--grep` accepts a regex.
 */
export const prSmokeGateGrep = `${Tag.smoke}|${Tag.auth}|${Tag.apiAuth}`;

/** PR / @auth lane: invert so account-selection runs only in `test:account-selection:ci`. */
export const accountSelectionGrepInvert = Tag.accountSelection;
