# Bizflex Playwright automation

TypeScript + Playwright UI/API tests for BizFlex flows.

## Editor and Cursor setup

Install the extensions VS Code / Cursor suggests when you open this folder (`.vscode/extensions.json`). They are **recommended**, not all strictly required, but together they materially improve quality for this repo.

| Extension | Why it helps |
| --- | --- |
| **ESLint** (`dbaeumer.vscode-eslint`) | Surfaces `eslint.config.js` issues inline (unused vars, `require-await`, Playwright rules). Cursor uses the same diagnostics when editing tests. |
| **Prettier** (`esbenp.prettier-vscode`) | Consistent formatting; pairs with `formatOnSave` in `.vscode/settings.json`. |
| **TypeScript** (built-in) | Strict checking from `tsconfig.json`; better completions and refactors in `.ts` tests and helpers. |
| **Playwright** (`ms-playwright.playwright`) | Pick locators, run/debug tests, trace viewer from the editor. |
| **YAML** (`redhat.vscode-yaml`) | Schema-backed editing for `.github/workflows/*.yml` (workflow validation). |
| **GitHub Actions** (`github.vscode-github-actions`) | Workflow syntax, expression hints, and CI context in the editor. |
| **Error Lens** (`usernamehw.errorlens`) | Surfaces errors/warnings on the line (works well with ESLint + TS). |
| **Dotenv** (`mikestead.dotenv`) | Highlights and navigation for `.env` / `.env.local` (secrets stay local; never commit real credentials). |
| **GitLens** (`eamodio.gitlens`) | History and blame for test and helper changes. |
| **Path Intellisense** (`christian-kohler.path-intellisense`) | Fewer broken imports in a multi-folder layout. |
| **Todo Tree** (`gruntfuggly.todo-tree`) | Tracks TODO/FIXME in specs and support code. |
| **Code Spell Checker** (`streetsidesoftware.code-spell-checker`) | Catches typos in strings, descriptions, and comments. |
| **Markdown All in One** (`yzhang.markdown-all-in-one`) | Editing docs and PR notes. |

**Cursor** benefits most from **ESLint + Prettier + TypeScript** (correct, consistent code) and **Playwright + YAML + GitHub Actions** (tests and CI stay aligned with what actually runs in GitHub).

### Workspace behavior (after extensions are installed)

- **Format on save**: `.vscode/settings.json` enables Prettier for TypeScript; saving a `.ts` file should reformat it.
- **ESLint inline**: ESLint extension reads `eslint.config.js`; warnings/errors show in the Problems panel and inline (with Error Lens, on the line).
- **GitHub Actions YAML**: `yaml.schemas` in settings maps workflow files to the GitHub Workflow schema for validation.
- **Run Playwright from the editor**: Use the Playwright extension’s testing sidebar or “Run Test” codelens where available; CLI remains `npx playwright test` / npm scripts from `package.json`.
- **Explorer noise**: `playwright-report`, `test-results`, and `node_modules` are hidden via `files.exclude`.

## Scripts

See `package.json` for `test:smoke`, `test:regression`, `test:auth`, etc.
