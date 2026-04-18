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