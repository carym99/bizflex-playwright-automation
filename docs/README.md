# Playwright QA Rules

This folder documents the shared test standards for this Playwright project. The machine-readable rules live under `.cursor/rules/`.

- Lane layout, tags, and CI mapping: `TESTING_GUIDE.md` (repo root)
- Primary standard doc: `.cursor/rules/testing.mdc`
- Keep secrets out of docs and specs; use env vars from `.env.local` / CI secrets.
- Mirror Cypress behavior where parity is required.

## GitHub Actions (CI)

Workflow: `.github/workflows/playwright-lanes.yml`. Global setup seeds `storage/authenticated-user.json` via API login and a headless Chromium visit to the SPA.

### Required repository settings

- **Secret:** `TEST_PASSWORD`
- **Secret or Variable:** `TEST_EMAIL` (repository **secret** `TEST_EMAIL` is used first if set; otherwise repository **variable** `TEST_EMAIL`)

### Where to configure

1. Open **Repository → Settings → Secrets and variables → Actions**
2. Under **Secrets**, add `TEST_PASSWORD` (and optionally `TEST_EMAIL` if you do not use a variable for the email).
3. Under **Variables**, add `TEST_EMAIL` if you prefer the login email as a non-secret variable.

The verify step fails fast with separate error messages if `TEST_EMAIL` is missing entirely (neither secret nor variable) or if `TEST_PASSWORD` is missing.

### Optional secrets / variables

- `API_URL` (workflow defaults to `https://bizflex.onrender.com` if unset)
- `PLAYWRIGHT_BASE_URL` (defaults to `https://bizflex-app.netlify.app` if unset)
- `VALID_USER_EMAIL`, `VALID_USER_PASSWORD`, `UI_USER_EMAIL`, `UI_USER_PASSWORD`, `MFA_USER_EMAIL`, `MFA_USER_PASSWORD` as needed for specific specs

## Transfer API Environment Setup

`tests/regression/single-transfer.api.spec.ts` reads transfer secrets from env-backed fixture helpers.  
Set these in `.env` (local) and CI secret vars:

- `TRANSFER_ACCOUNT_ID`
- `TRANSFER_TRANSACTION_PIN`
- `TRANSFER_BANK_CODE`
- `TRANSFER_BENEFICIARY_ACCOUNT_NAME`
- `TRANSFER_BENEFICIARY_ACCOUNT_NUMBER`
- `TRANSFER_BENEFICIARY_BANK_NAME`
- `TRANSFER_LARGE_AMOUNT` (optional boundary tuning)

Sensitive values must stay in env variables, not inline in test specs.
