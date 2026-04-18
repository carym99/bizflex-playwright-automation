# Playwright + CI/CD — principal audit & migration plan

This document complements `TESTING_GUIDE.md`. It records the **current** state, **risks**, **recommended** target architecture, and a **phased** migration so the repo can evolve without a single destructive rename.

---

## 1. Repository audit (summary table)

| Current problem | Why it is risky | Recommended fix | Expected benefit |
|-----------------|-----------------|-----------------|------------------|
| ~~Two `LoginPage` paths (`pages/`, `page-objects/`)~~ | ~~Drift~~ | **Resolved:** removed redundant `page-objects/LoginPage.ts` re-export | Imports use `pages/LoginPage` only |
| XPath for “Create Unique Link” (`PaymentLinkPage`) | Breaks on copy/i18n/layout | `getByRole('button', { name: /…/ })` | Stable selectors |
| `force: true` on several clicks (modals, publish) | Hides real actionability bugs | **`clickWithScrollThenForceFallback`** (`support/ui/clickPreferringActionability.ts`) — normal click first | Fewer unnecessary `force` clicks |
| Global setup depends on API + optional UI fallback | TLS/network flakiness to Render | Retain retries; optional `AUTH_SEED_RETRY_DELAY_MS`; document env | CI recovers without manual rerun |
| `PLAYWRIGHT_BASE_URL` with path (e.g. `/login`) | Wrong `baseURL`, storage origin confusion | Origin-only URL in env | Consistent seeding and navigation |
| Lane grep duplicated in YAML/scripts | Typos drift from matrix | Central `config/tags.ts` + docs | One definition of lane patterns |
| Single workflow ran full matrix on every PR | Slow PR feedback, queue pressure | `ci-smoke.yml` on PR; full matrix on `main` | &lt;15 min PR signal |
| No JUnit / GitHub reporter in config | Poor CI parsing, no inline annotations | `junit` + `github` reporters | Better visibility in GitHub UI |
| Retries = 2 in CI | Masks systemic failures longer | `retries: 1` in CI (tunable) | Faster fail on real breaks |
| Duplicate `api/` vs `tests/api-auth` history | Confusion in docs | Keep `tests/` as canonical; `.gitkeep` under legacy `api/` only | Clear layout |
| No `@payments` / `@transfers` lane in matrix yet | Domain tests lumped in `@regression` | Add tags + optional matrix row later | Finer scheduling |
| “Quality gates” (flaky %, skip threshold) | Not in CI without analytics | Phase 2: upload JUnit to reporting service or custom parser | Data-driven gates |

---

## 2. Target folder architecture (phased)

**Today (canonical):** `tests/smoke`, `tests/auth`, `tests/api-auth`, `tests/regression` + `pages/`, `fixtures/`, `support/`, `helpers/`, `utils/`.

**Target (enterprise layout from prompt):**

```text
tests/
  ui/{smoke,regression,auth,payments,transfers}/
  api/{auth,payment-links,transfers,users}/
  shared/{fixtures,test-data,factories,utils,constants}/
```

**Phase 1 (done / ongoing):** Lane tags + CI split (`ci-smoke` / `ci-full` / `nightly`) + `config/tags.ts` + reporters + config tuning. **No mass moves** until a dedicated PR reduces import churn.

**Phase 2:** Move API specs under `tests/api/...` and UI under `tests/ui/...`; update `playwright.config.ts` `testMatch` / `testIgnore`.

**Phase 3:** Collocate shared factories next to tests; gradually move `fixtures/` → `tests/shared/fixtures` with path aliases in `tsconfig` if desired.

---

## 3. Tagging strategy

| Tag | Use |
|-----|-----|
| `@smoke` | Critical path, &lt;15 min PR gate |
| `@auth` | Login / session UI (`ui-login` project) |
| `@api-auth` | Token, login API, refresh, logout |
| `@regression` | Breadth, edge cases, non-blocking on PR |
| `@payments` / `@transfers` | (Future) domain slices for matrix or nightly |
| `@critical` | (Optional) subset of smoke for release train |
| `@flaky` | (Optional) quarantined tests run only nightly |

**CI matrix (unchanged):** `smoke` \| `auth` \| `api-auth` \| `regression` → grep `@<lane>`.

**PR smoke workflow:** single grep `@smoke|@auth|@api-auth` (see `config/tags.ts`).

---

## 4. Playwright config improvements (implemented)

- `retries`: **1** in CI (was 2).
- `workers`: **4** in CI (override with `PW_WORKERS`).
- `trace`: **retain-on-failure**; screenshot/video unchanged.
- `reporters`: **list**, **html**, **junit** → `reports/junit.xml`, **github** when `GITHUB_ACTIONS` is set.
- `use.testIdAttribute`: **`data-testid`** (prefer selectors in new code).

---

## 5. CI/CD workflows (implemented)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci-smoke.yml` | `pull_request` | Fast gate: `@smoke\|@auth\|@api-auth`, concurrency, npm + browser cache |
| `ci-full.yml` | `push` to `main`, `workflow_dispatch` | Matrix lanes + artifacts + step summary |
| `nightly-regression.yml` | `schedule` (06:00 UTC) + manual | Full `playwright test` (all projects) |

**Removed:** `playwright-lanes.yml` (superseded to avoid duplicate PR runs).

---

## 6. API architecture (next steps)

Introduce thin clients under `api-clients/` (e.g. `auth.client.ts`) wrapping `APIRequestContext` + paths from env. Move payload builders to `tests/shared/factories/` as specs are touched. **No secrets in repo** — keep pins/tokens in `.env` / GitHub Secrets (already pattern in transfer fixtures).

---

## 7. Quality gates (future)

- Block merge: branch protection requiring `ci-smoke` (and optional `ci-full` on main).
- Flaky rate / skip threshold: needs JUnit history or external dashboard; not automated in YAML alone.

---

## 8. Deliverables checklist

- [x] Weaknesses list (section 1)
- [x] Files modified / workflows split
- [x] `config/tags.ts`
- [x] `playwright.config.ts` hardened
- [x] Example locator improvement (`Create Unique Link`)
- [ ] Full folder migration (phase 2)
- [ ] `api-clients/*` full extraction (phase 2)
- [ ] Remove all `force: true` (incremental)

---

## 9. Risks & remaining debt

- **Nightly** full suite duration and cost.
- **Browser cache** key must bump when Playwright version changes (`package-lock.json` hash helps).
- **Parallel PR smoke** still runs global setup once per job (single job = one setup — good).
