// @ts-check
/**
 * ESLint flat config — TypeScript + Playwright (ESLint 10).
 * Uses devDependencies from package.json (no extra installs for this file).
 */
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const playwright = require('eslint-plugin-playwright');

// Includes e.g. playwright/no-focused-test: error, playwright/no-wait-for-timeout: warn
const playwrightRecommended = playwright.configs['flat/recommended'];

/** Playwright rules only where tests and automation code live (see plugin README). */
const playwrightFiles = [
  'tests/**/*.ts',
  'e2e/**/*.ts',
  'support/**/*.ts',
  'pages/**/*.ts',
  'helpers/**/*.ts',
  'utils/**/*.ts',
  'api-clients/**/*.ts',
  'fixtures/**/*.ts',
  'schemas/**/*.ts',
  'config/**/*.ts',
  '**/*.spec.ts',
  'playwright.config.ts',
];

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  {
    ...playwrightRecommended,
    files: playwrightFiles,
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/node_modules/**', '**/dist/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'require-await': 'warn',
    },
  },
];
