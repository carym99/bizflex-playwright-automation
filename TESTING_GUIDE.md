# Playwright testing guide

## Folder layout

Tests live under `tests/` and are grouped by **lane** (same names as the GitHub Actions matrix):

```text
tests/
  smoke/        Critical happy-path checks (fast signal in CI)
  auth/         Login, logout, session, MFA, account-state UI, etc. (fresh browser; no saved session)
  api-auth/     API authentication, tokens, refresh, logout, protected routes
  regression/   Broader API and UI coverage, edge cases, long flows
```

Supporting code (unchanged): `pages/`, `fixtures/`, `support/`, `storage/` (generated `authenticated-user.json` from global setup).

## Tag conventions

Use **exactly** these Playwright grep tags (match CI `matrix.lane` values):

| Tag            | Meaning                                      |
|----------------|----------------------------------------------|
| `@smoke`       | Critical path; should stay small and stable |
| `@auth`        | Auth-focused UI (login project)             |
| `@api-auth`    | Auth/session/token API behavior             |
| `@regression`  | Extended coverage                           |

Put the tag on every `test.describe` title (preferred) or on each `test()` title:

```ts
test.describe('@smoke Payment link create and verify', () => { /* ... */ });
test.describe('@auth User Login UI', () => { /* ... */ });
test('@regression creates single transfer with valid payload', async () => { /* ... */ });
```

### Dual-tagging

A test runs in **every** lane whose tag appears in its title. To run a flow in both smoke and regression, include both tags in the same title, for example:

```ts
test('@smoke @regression user can complete checkout', async ({ page }) => { /* ... */ });
```

Regression-only tests should have **only** `@regression` so they are not picked up by `--grep @smoke`.

## How CI maps to tags

Workflow: `.github/workflows/playwright-lanes.yml`.

Each matrix job runs:

```bash
npx playwright test --grep "@${{ matrix.lane }}"
```

With `matrix.lane` in `smoke`, `auth`, `api-auth`, `regression`, the effective greps are `@smoke`, `@auth`, `@api-auth`, `@regression`.

## Projects (`playwright.config.ts`)

| Project             | Purpose |
|---------------------|---------|
| `api`               | `tests/api-auth/**` and `tests/regression/**/*.api.spec.ts` — uses `API_URL` as `baseURL` |
| `ui-authenticated`  | `tests/smoke/**` and `tests/regression/**` except `*.api.spec.ts` — uses SPA `baseURL` + `storage/authenticated-user.json` |
| `ui-login`          | `tests/auth/**` — SPA `baseURL` + empty `storageState` |

`playwright test` without `--project` runs all projects. Lane scripts use `--grep` only so each job still executes the right **projects** for matching tests.

## Local commands

```bash
npm run test:smoke
npm run test:auth
npm run test:api-auth
npm run test:regression
```

Other useful scripts:

- `npm run test` — runs `auth` helper then full Playwright suite
- `npm run test:api` — `--project=api`
- `npm run test:ui` — `--project=ui-authenticated`
- `npm run test:only` — Playwright with no extra prep

## Adding a new spec

1. Choose the folder that matches the primary lane.
2. Add the matching `@tag` to the describe (or test) title.
3. If the file is **API-only** HTTP tests under `regression/`, name it `*.api.spec.ts` so it stays in the `api` project and out of authenticated UI.
