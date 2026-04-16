# Playwright QA Rules

This folder documents the shared test standards for this Playwright project. The machine-readable rules live under `.cursor/rules/`.

- Primary standard doc: `.cursor/rules/testing.mdc`
- Keep secrets out of docs and specs; use env vars from `.env.local` / CI secrets.
- Mirror Cypress behavior where parity is required.

## GitHub Actions (CI)

Workflow: `.github/workflows/playwright-lanes.yml`. Global setup seeds `storage/authenticated-user.json` via API login and a headless Chromium visit to the SPA.

**Required for global auth setup** (Settings → Secrets and variables → Actions):

- `TEST_PASSWORD` (repository **secret**)
- `TEST_EMAIL`: either a repository **secret** named `TEST_EMAIL`, **or** a repository **variable** named `TEST_EMAIL` (same name; the workflow prefers the secret when both are set)

**Recommended** (used by some specs; optional depending on coverage you run):

- `API_URL` (defaults to `https://bizflex.onrender.com` in the workflow if unset)
- `PLAYWRIGHT_BASE_URL` (defaults to `https://bizflex-app.netlify.app` if unset)
- `VALID_USER_EMAIL`, `VALID_USER_PASSWORD`, `UI_USER_EMAIL`, `UI_USER_PASSWORD`, `MFA_USER_EMAIL`, `MFA_USER_PASSWORD` as needed

If `TEST_PASSWORD` is missing, or `TEST_EMAIL` is not set as either a secret or a repository variable, the workflow fails fast before `npm ci`. Wrong credentials show up as API or browser errors later in the job log.

## Transfer API Environment Setup

`api/transfers/single-transfer.api.spec.ts` reads transfer secrets from env-backed fixture helpers.  
Set these in `.env` (local) and CI secret vars:

- `TRANSFER_ACCOUNT_ID`
- `TRANSFER_TRANSACTION_PIN`
- `TRANSFER_BANK_CODE`
- `TRANSFER_BENEFICIARY_ACCOUNT_NAME`
- `TRANSFER_BENEFICIARY_ACCOUNT_NUMBER`
- `TRANSFER_BENEFICIARY_BANK_NAME`
- `TRANSFER_LARGE_AMOUNT` (optional boundary tuning)

Sensitive values must stay in env variables, not inline in test specs.
