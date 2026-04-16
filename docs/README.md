# Playwright QA Rules

This folder documents the shared test standards for this Playwright project. The machine-readable rules live under `.cursor/rules/`.

- Primary standard doc: `.cursor/rules/testing.mdc`
- Keep secrets out of docs and specs; use env vars from `.env.local` / CI secrets.
- Mirror Cypress behavior where parity is required.

## GitHub Actions (CI)

Workflow: `.github/workflows/playwright-lanes.yml`. Global setup seeds `storage/authenticated-user.json` via API login and a headless Chromium visit to the SPA.

**Required repository secrets** (Settings → Secrets and variables → Actions):

- `TEST_EMAIL`
- `TEST_PASSWORD`

**Recommended** (used by some specs; optional depending on coverage you run):

- `API_URL` (defaults to `https://bizflex.onrender.com` in the workflow if unset)
- `PLAYWRIGHT_BASE_URL` (defaults to `https://bizflex-app.netlify.app` if unset)
- `VALID_USER_EMAIL`, `VALID_USER_PASSWORD`, `UI_USER_EMAIL`, `UI_USER_PASSWORD`, `MFA_USER_EMAIL`, `MFA_USER_PASSWORD` as needed

If `TEST_EMAIL` / `TEST_PASSWORD` are missing, the auth storage step cannot run and Playwright lanes will fail.

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
