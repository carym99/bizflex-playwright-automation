/**
 * Central selectors — aligned with cypress/pages + support/selectors (data-testid first).
 */
/** Post-login account picker (`/select-account`). Prefer data-testid when the app adds them. */
export const selectAccountSelectors = {
  screen: '[data-testid="select-account-page"]',
  card: (accountId: string) =>
    `[data-testid="select-account-option-${accountId}"], [data-testid="account-option-${accountId}"]`,
  continue: '[data-testid="select-account-continue"]',
};

export const loginSelectors = {
  email: '[data-testid="email"], [data-testid="email-input"], input[type="email"]',
  password: '[data-testid="password"], [data-testid="password-input"], input[type="password"]',
  submit: '[data-testid="login-button"], button[type="submit"]',
};

export const accountSelectors = {
  root: '[data-testid="account-page"], main',
  quickAction: 'text=Quick Action',
};

export const transactionSelectors = {
  table: 'table',
  firstRow: 'table tbody tr:first-child',
  balanceWidget:
    '[data-testid="account-balance"], [data-testid="wallet-balance"], [data-testid*="balance"]',
  row:
    '[data-testid="transaction-row"], table tbody tr, [data-testid="transaction-history"] [role="row"]',
  /** Dashboard “recent transactions” widget — prefer testids, fall back to main content table */
  recentTransactionsRegion:
    '[data-testid="recent-transactions"], [data-testid="recent-transactions-card"], [data-testid="transaction-history"], [data-testid="recent-transactions-section"]',
};
