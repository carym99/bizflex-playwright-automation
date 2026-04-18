/**
 * Central tag strings for Playwright titles and CI grep.
 * Matrix lanes in GitHub Actions must stay in sync with these values.
 */
export const Tag = {
  smoke: '@smoke',
  auth: '@auth',
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
 * Playwright `--grep` accepts a regex.
 */
export const prSmokeGateGrep = `${Tag.smoke}|${Tag.auth}|${Tag.apiAuth}`;
