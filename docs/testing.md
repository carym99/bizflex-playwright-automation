# Testing Guide

## Overview

This project uses Playwright with TypeScript and Page Object Model (POM).

Testing pyramid:

- 70% API + session-injected tests
- 20% focused UI tests
- 10% end-to-end Cucumber flows

---

## Folder Structure

```text
tests/
  smoke/
  auth/
  api-auth/
  regression/
e2e/                 # Cucumber (separate from Playwright test runner)
helpers/
pages/
fixtures/
support/
storage/             # generated auth state (global setup)
```

See `TESTING_GUIDE.md` for lane tags and CI commands.

## QA baseline (governance)

Generate an inventory vs the pyramid (counts, CI lanes, unused tags, risk gaps):

```bash
npm run qa:baseline
```

Output: `reports/qa-baseline.md` (also appended to nightly GitHub step summary when present).

## Typecheck

```bash
npm run typecheck
```

Required before merge; CI typecheck job can be added when the team enables it in GitHub Actions.