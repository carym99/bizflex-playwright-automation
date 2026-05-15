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

export const paymentLinkSelectors = {
  dashboard: '[data-testid="payment-link-dashboard"], [data-testid="payment-link-page"]',
  generalCard: '[data-testid="general-payment-link-card"], [data-testid="general-payment-link-section"]',
  copyGeneral:
    '[data-testid="general-payment-link-copy-btn"], [data-testid="copy-general-link-button"]',
  createUnique:
    '[data-testid="create-unique-link-btn"], [data-testid="create-unique-link-button"]',
  modal: '[data-testid="unique-payment-link-modal"], [data-testid="create-payment-link-modal"]',
  paymentName: '[data-testid="payment-name-input"], input[placeholder*="Payment Name" i]',
  amount: '[data-testid="amount-input"], input[name="amount"]',
  email: '[data-testid="email-input"], input[type="email"]',
  description: '[data-testid="description-input"], textarea[name="description"]',
  publish: '[data-testid="publish-link-button"]',
  successModal: '[data-testid="payment-link-success-modal"], [data-testid="success-modal"]',
  generatedLink: '[data-testid="generated-payment-link"], [data-testid="payment-link-url"]',
  viewLinks: '[data-testid="view-payment-links-button"], [data-testid="view-links-button"]',
  totalLinks: '[data-testid="total-links-created"], [data-testid="total-links-card"]',
  /** List / table / grid that shows created payment links */
  linkListRegion:
    '[data-testid="payment-links-list"], [data-testid="payment-links-table"], [data-testid="payment-link-list"], [role="grid"], table',
  linkRow: '[data-testid="payment-link-row"], tbody tr, [role="row"]',
};

export const paymentSelectors = {
  /** Hosted checkout / payment UI — adjust when targeting a specific testid */
  amount: '[data-testid="payment-amount"], [data-testid="amount"]',
  paySubmit: 'button:has-text("Pay"), button[type="submit"]',
  cardNumber: 'input[name*="card" i], input[placeholder*="card" i]',
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
