# Playwright QA Rules

This folder documents the shared test standards for this Playwright project. The machine-readable rules live under `.cursor/rules/`.

- Lane layout, tags, and CI mapping: `TESTING_GUIDE.md` (repo root)
- Primary standard doc: `.cursor/rules/testing.mdc`
- Keep secrets out of docs and specs; use env vars from `.env.local` / CI secrets.
- Mirror Cypress behavior where parity is required.

## GitHub Actions (CI)

Workflows: `.github/workflows/ci-smoke.yml` (pull requests), `.github/workflows/ci-full.yml` (push to `main`), `.github/workflows/nightly-regression.yml` (schedule). Authenticated UI uses project **`setup`** (`tests/setup/auth.setup.ts`) to refresh and verify **`storage/authenticated-user.json`**, which the **`chromium`** project loads as `storageState`.

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
- `E2E_DEFAULT_ACCOUNT_ID` — when the app lands on [`/select-account`](https://bizflex-app.netlify.app/select-account), Playwright picks that row if `data-testid="select-account-option-<id>"` (or `account-option-<id>`) exists; otherwise extend `support/ui/resolveSelectAccount.ts`

## Transfer API Environment Setup

`tests/regression/single-transfer.api.spec.ts` authenticates with **`loginForTransferAccessToken`**: it uses **`VALID_USER_EMAIL` first** when set (then `VALID_USER_PASSWORD` if set, otherwise `TEST_PASSWORD`), so the debiting user matches your non-PND account in `.env.local`. If `VALID_USER_EMAIL` is unset, it falls back to the same rules as other API helpers (`getValidEmail` / `TEST_PASSWORD`).

Set transfer payload and pin in `.env` / `.env.local` and CI secret vars:

- `TRANSFER_ACCOUNT_ID`
- `TRANSFER_TRANSACTION_PIN`
- `TRANSFER_BANK_CODE`
- `TRANSFER_BENEFICIARY_ACCOUNT_NAME`
- `TRANSFER_BENEFICIARY_ACCOUNT_NUMBER`
- `TRANSFER_BENEFICIARY_BANK_NAME`
- `TRANSFER_LARGE_AMOUNT` (optional boundary tuning)

Sensitive values must stay in env variables, not inline in test specs.
