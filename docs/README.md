# Playwright QA Rules

This folder documents the shared test standards for this Playwright project. The machine-readable rules live under `.cursor/rules/`.

- Primary standard doc: `.cursor/rules/testing.mdc`
- Keep secrets out of docs and specs; use env vars from `.env.local` / CI secrets.
- Mirror Cypress behavior where parity is required.

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
