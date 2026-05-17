#!/usr/bin/env bash
# Shared defaults for Playwright CI/local (no secrets in this file).
set -euo pipefail

export API_URL="${API_URL:-https://bizflex.onrender.com}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://bizflex-app.netlify.app}"
export BASE_URL="${BASE_URL:-${PLAYWRIGHT_BASE_URL}}"

# Optional strict check when running account-selection in CI
if [ "${REQUIRE_E2E_ACCOUNT_CONTEXT:-}" = "1" ]; then
  missing=()
  [ -z "${TEST_EMAIL:-}" ] && missing+=(TEST_EMAIL)
  [ -z "${TEST_PASSWORD:-}" ] && missing+=(TEST_PASSWORD)
  [ -z "${E2E_FREELANCE_ACCOUNT_CONTEXT_ID:-}" ] && [ -z "${E2E_FREELANCE_ACCOUNT_NAME:-}" ] && \
    missing+=(E2E_FREELANCE_ACCOUNT_CONTEXT_ID_or_E2E_FREELANCE_ACCOUNT_NAME)
  [ -z "${E2E_BUSINESS_ACCOUNT_CONTEXT_ID:-}" ] && [ -z "${E2E_BUSINESS_ACCOUNT_NAME:-}" ] && \
    missing+=(E2E_BUSINESS_ACCOUNT_CONTEXT_ID_or_E2E_BUSINESS_ACCOUNT_NAME)
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "::error::Missing required account-context env for CI: ${missing[*]}"
    exit 1
  fi
fi
