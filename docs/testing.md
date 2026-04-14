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
api/
e2e/
helpers/
page-objects/
tests/
ui/