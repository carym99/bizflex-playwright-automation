# QA automation handoff (BizFlex Playwright)

Persistent context for Codex, Cursor, and other agents continuing Playwright work on this repo. **Do not paste real credentials into this file.**

**Related:** [ACCOUNT_CONTEXT.md](./ACCOUNT_CONTEXT.md) — env vars, API mapping, picker behavior.

---

## 1. Purpose

BizFlex now routes users through **`/select-account`** after login when multiple workspaces exist. Playwright automation must treat **account context selection** as part of authentication/setup, not as an optional UI step.

Implications:

- `npm run auth` and seeded `storageState` must pick a default account using `E2E_*` env vars.
- UI tests that use **`authenticatedPage`** must handle redirect to `/select-account`, select the configured account, then assert `/account` dashboard readiness.
- API validation should prefer **`accountContextId`** / account **`id`** from `/profile` or `/contexts` over brittle display names (API vs UI spacing can differ).
- Tests must **not** treat `/select-account` as `/account` (strict path helpers in `support/ui/accountRoutes.ts`).

---

## 2. Current local baseline

**Account-selection suite (validated):**

| Metric | Value |
|--------|--------|
| Passed | 4 (focused engineering suite) |
| Cucumber | 8 scenarios (`npm run test:e2e:accounts`, nightly) |
| Project | `ui-login` |

**Command:**

```bash
npx playwright test tests/auth/account-selection.ui.spec.ts --project=ui-login --workers=1
```

**CI equivalent:**

```bash
npm run test:account-selection:ci
```

**Requirements:** Complete `E2E_*` account context variables in `.env.local` (see section 5). Without freelance + business targeting, some tests skip; without `E2E_BUSINESS_*_2`, two second-business tests skip (7 passed / 2 skipped is possible).

---

## 3. Key account context concepts

### Type mapping (freelance vs individual)

| Layer | Freelance / individual | Business |
|--------|------------------------|----------|
| Test config (`accountType`) | `freelance` | `business` |
| UI picker label | Freelancer | Business |
| `/contexts` API `type` | `FREELANCE` (uppercase common) | `BUSINESS` |
| `/profile` accounts `type` | `individual` | `business` |

**Normalization** is centralized in `config/accountContext.ts`:

- `normalizeAccountType()` — maps `freelance`, `freelancer`, `individual` → `freelance`; `business` → `business`
- `accountTypesMatch()` — compares test config to API/UI raw types
- `accountNamesMatchLoosely()` — ignores extra/missing spaces (e.g. API `Imperial LeatherSoap` vs UI `Imperial Leather Soap`)

### Selection priority (picker UI)

1. `data-testid="select-account-context-{accountContextId}"` (recommended; often missing in app)
2. `data-testid="select-account-option-{accountId}"`
3. Loose name match from `E2E_*_ACCOUNT_NAME`
4. Type-only (`freelance` / `business`) — **only** when exactly one card of that type exists (never “first business row” when multiple exist)

### Login success signals

`support/ui/waitForLoginOutcome.ts` treats login as successful when any of:

- URL is `/select-account` or `/account`
- Heading **“Choose an account to continue”** is visible
- **`/contexts` returns HTTP 200**

Still on **`/login`** after timeout → clear error (credentials or API path mismatch).

---

## 4. Important files

| File | Role |
|------|------|
| `config/accountContext.ts` | Env presets (`E2E_FREELANCE_*`, `E2E_BUSINESS_*`), type normalization, skip reasons |
| `support/ui/accountContextApi.ts` | Captures/parses `/profile` and `/contexts`; validates targets before UI click; merge-safe records |
| `support/ui/selectAccount.ts` | `selectAccountOnPicker`, `resolveSelectAccountToDashboardIfNeeded`, `assertActiveAccountContext` |
| `support/ui/ensureAuthenticatedDashboard.ts` | Storage → `/account` or `/select-account` → pick env account → dashboard ready; diagnostic errors |
| `support/ui/loginAndSelectAccount.ts` | Full UI login + picker + dashboard |
| `support/ui/waitForLoginOutcome.ts` | Post-submit login outcome (picker, contexts 200, routes) |
| `support/ui/prepareAuthenticatedPage.ts` | Post-navigation modals, dashboard readiness, session assert (idempotent) |
| `pages/SelectAccountPage.ts` | POM: picker heading, cards, Continue |
| `tests/shared/fixtures/account.fixture.ts` | `authenticatedPage`, `freelancePage`, `businessPage`, `freshAccountPage` |
| `tests/auth/account-selection.ui.spec.ts` | `@auth @account-selection` — dedicated account-switch coverage |
| `support/ui/accountRoutes.ts` | Strict `/account` vs `/select-account` URL helpers |
| `support/auth/browserAuthSession.ts` | Bearer from localStorage / `sessionStorage.user`; `isAuthenticated()` profile probe |
| `support/ui/assertStillAuthenticated.ts` | Session checks; profile/cookie/shell fallbacks when token keys missing |
| `.github/scripts/export-playwright-account-env.sh` | CI URL defaults; optional `REQUIRE_E2E_ACCOUNT_CONTEXT=1` |
| `.github/workflows/ci-smoke.yml` | PR: auth + account-selection gate + smoke grep |
| `.github/workflows/ci-full.yml` | Main matrix; account-selection on `auth` lane only |
| `.github/workflows/nightly-regression.yml` | Nightly account-selection + full suite (excl. `@account-selection`) |
| `docs/ACCOUNT_CONTEXT.md` | Detailed env matrix and CI flow |
| `config/tags.ts` | `Tag.accountSelection`, `prSmokeGateGrep`, grep-invert constant |

---

## 5. Required local `.env.local` variables

Use placeholders only — copy from `.env.example` and fill from your QA user’s `/profile` and `/contexts` responses.

### Core

```bash
PLAYWRIGHT_BASE_URL=https://your-app-origin.example
TEST_EMAIL=your_test_email@example.com
TEST_PASSWORD=your_test_password
UI_USER_EMAIL=your_ui_email@example.com   # optional if same as TEST_EMAIL
UI_USER_PASSWORD=your_ui_password         # optional if same as TEST_PASSWORD
API_URL=https://your-api-host.example
```

### Default account (`npm run auth`, `loginAndSelectAccount`)

```bash
E2E_SELECT_ACCOUNT_TYPE=freelance
E2E_SELECT_ACCOUNT_NAME=
E2E_SELECT_ACCOUNT_CONTEXT_ID=
E2E_SELECT_ACCOUNT_ID=
```

### Freelance (individual)

```bash
E2E_FREELANCE_ACCOUNT_NAME=
E2E_FREELANCE_ACCOUNT_ID=
E2E_FREELANCE_ACCOUNT_CONTEXT_ID=
E2E_FREELANCE_WALLET_ID=
E2E_FREELANCE_BUSINESS_ID=
```

### Primary business

```bash
E2E_BUSINESS_ACCOUNT_NAME=
E2E_BUSINESS_ACCOUNT_ID=
E2E_BUSINESS_ACCOUNT_CONTEXT_ID=
E2E_BUSINESS_ID=
E2E_BUSINESS_WALLET_ID=
```

### Second business (optional — needed for **9/9** account-selection tests)

```bash
E2E_BUSINESS_ACCOUNT_NAME_2=
E2E_BUSINESS_ACCOUNT_CONTEXT_ID_2=
E2E_BUSINESS_ID_2=
# Optional: E2E_BUSINESS_ACCOUNT_ID_2, E2E_BUSINESS_WALLET_ID_2
```

Without `*_2` vars, tests for second-business visibility and business-to-business switch **skip** (not fail).

---

## 6. CI/CD state

| Topic | Behavior |
|-------|----------|
| Dedicated gate | `npm run test:account-selection:ci` (`ui-login`, `--workers=1`) |
| Auth storage | `npm run auth` runs **before** account-selection in PR, nightly, and ci-full auth lane |
| Duplicate runs avoided | Generic `@auth` greps use `--grep-invert "@account-selection"` |
| Tags | Spec file: `@auth @account-selection` (keeps `@auth` for reporting) |
| `ui-login` workers | **1** in CI (`playwright.config.ts`) — avoids concurrent UI logins on one QA user |
| Generated files | `storage/*.json`, `.auth/` — **gitignored**; CI regenerates each run |
| Secrets | All `E2E_*` and credentials must be **GitHub repository secrets** (never committed) |
| Strict env check | `REQUIRE_E2E_ACCOUNT_CONTEXT=1` on account-selection CI steps |

**Workflow summary:**

| Workflow | Account-selection | Other tests |
|----------|-------------------|-------------|
| `ci-smoke.yml` (PR) | `test:account-selection:ci` | `@smoke\|@auth\|@api-auth` + invert |
| `ci-full.yml` | Auth lane only | Per-matrix `@smoke`, `@auth` (invert), `@api-auth`, `@regression` |
| `nightly-regression.yml` | Dedicated step, then `playwright test --grep-invert "@account-selection"` | Full suite minus picker spec |

---

## 7. Known good CI commands

```bash
source .github/scripts/export-playwright-account-env.sh
npm run auth
REQUIRE_E2E_ACCOUNT_CONTEXT=1 npm run test:account-selection:ci
npx playwright test --grep "@smoke|@auth|@api-auth" --grep-invert "@account-selection"
```

**Auth lane (ci-full):**

```bash
npx playwright test --grep "@auth" --grep-invert "@account-selection"
```

---

## 8. Current known issue / next focus

### Account-selection: stable

The dedicated suite is green locally and wired for CI. **Do not regress** `tests/auth/account-selection.ui.spec.ts` when changing fixtures.

### Cucumber (non-technical) features

Business-readable scenarios live in **`e2e/features/account-selection.feature`** (“Choose a workspace after login”). They reuse the same env-driven helpers as Playwright; scenarios skip automatically when freelance/business env is not configured.

```bash
npm run test:e2e:accounts
```

### Smoke / chromium fixtures

`auth.setup.ts` and **`authenticatedPage`** use `ensureAuthenticatedDashboardPage` (picker resolution + dashboard shell poll), not a bare `toHaveURL(/account/)` check.

**Example:**

- `tests/smoke/dashboard.smoke.spec.ts`

**Typical symptom:**

```
Test timeout of 60000ms exceeded while setting up "authenticatedPage"
Fixture: tests/shared/fixtures/account.fixture.ts
```

**Observed pattern (historical):**

- Navigate to `/account` succeeds
- App redirects to **`/select-account`** when storage has no active context
- `expect(page).toHaveURL(/account/)` waited ~45s while still on `/select-account`
- `GET /v1/users/profile` could return **200** while `assertAccessTokenPresent` still polled for `localStorage` token keys
- Failure in fixture setup, **not** the test body (dashboard assertions)

**Work already started (verify on your branch):**

- `ensureAuthenticatedDashboardPage()` — attach API capture before navigation, resolve picker, poll dashboard shell
- Relaxed `assertAccessTokenPresent` when profile/cookie session or dashboard shell is OK
- Slimmer `prepareAuthenticatedPage` (idempotent when already on dashboard)

**Next debugging focus if timeouts persist:**

1. `tests/shared/fixtures/account.fixture.ts` — bootstrap vs double `prepareAuthenticatedPage`
2. `support/ui/ensureAuthenticatedDashboard.ts` — diagnostics on timeout
3. `support/auth/browserAuthSession.ts` — token hydration vs cookie-only session
4. `support/ui/assertStillAuthenticated.ts` — avoid blocking on stale storage assumptions
5. Confirm `npm run auth` used the same `E2E_SELECT_ACCOUNT_*` as smoke tests expect

**Verify commands:**

```bash
npx playwright test tests/auth/account-selection.ui.spec.ts --project=ui-login --workers=1
npx playwright test tests/smoke/dashboard.smoke.spec.ts --project=chromium --workers=1
```

---

## 9. Debugging Playwright failures

When a test fails, capture:

1. **Full error and stack** (including fixture chain)
2. **Test name and file:line**
3. **Expanded Before Hooks / Test Steps** from HTML report
4. **Final screenshot** and **trace** (`npx playwright show-report` / `show-trace`)
5. **Stdout / console** and any **network** failures in trace
6. **Current URL** at failure (`/login`, `/select-account`, `/account`)
7. **Relevant helper code** — fixture, `prepareAuthenticatedPage`, `ensureAuthenticatedDashboardPage`, `selectAccountOnPicker`
8. **Exact run command** — project (`ui-login` vs `chromium`), `--workers`, grep tags
9. **Env presence** — which `E2E_*` vars are set (names only, not values)
10. **Whether `npm run auth` was run** recently with matching `E2E_SELECT_ACCOUNT_*`

**Quick checks:**

```bash
npm run auth
npx playwright test <spec> --project=<project> --workers=1 --trace on
```

---

## 10. Cursor / Codex continuation prompt

Copy into a new session:

```
Read docs/QA_AUTOMATION_HANDOFF.md and docs/ACCOUNT_CONTEXT.md. Continue from the current Playwright QA automation state. First focus on stabilizing authenticatedPage fixture timeouts after account switching, while preserving the account-selection suite result of 9 passed, 0 failed, 0 skipped.
```

---

## Intentionally omitted from this document

- Real passwords, API tokens, or session storage contents
- Full QA user email addresses
- Concrete `accountContextId`, `businessId`, wallet ids, or account numeric ids
- Contents of `storage/authenticated-user.json` or `.env.local`

Use `.env.example` and GitHub Actions secrets for actual values.
