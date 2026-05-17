/**
 * QA pyramid baseline — inventory vs testing.md (70% API / 20% UI / 10% E2E).
 * Run: npm run qa:baseline
 * Output: reports/qa-baseline.md
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const root = path.join(__dirname, '..');
const reportsDir = path.join(root, 'reports');

type Layer = 'api' | 'ui' | 'e2e' | 'setup';

function readFiles(dir: string, pattern: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (pattern.test(ent.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function countPlaywrightTests(filePath: string): number {
  const text = fs.readFileSync(filePath, 'utf8');
  return (text.match(/^\s*test\s*\(/gm) || []).length;
}

function countCucumberScenarios(filePath: string): number {
  const text = fs.readFileSync(filePath, 'utf8');
  return (text.match(/^\s*Scenario:/gm) || []).length;
}

function classifyPlaywrightFile(rel: string): Layer {
  if (rel.includes('setup/')) return 'setup';
  if (rel.includes('api-auth/') || rel.endsWith('.api.spec.ts')) return 'api';
  if (rel.includes('e2e/')) return 'e2e';
  return 'ui';
}

function tagUsage(): { tag: string; count: number }[] {
  const tags = ['@smoke', '@auth', '@api-auth', '@regression', '@account-selection', '@security', '@payments', '@transfers', '@critical', '@flaky', '@e2e'];
  const allTs = readFiles(path.join(root, 'tests'), /\.spec\.ts$/);
  const features = readFiles(path.join(root, 'e2e'), /\.feature$/);
  const blob = [...allTs, ...features]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');

  return tags.map((tag) => ({
    tag,
    count: (blob.match(new RegExp(tag.replace('@', '@'), 'g')) || []).length,
  }));
}

function ciLanes(): string[] {
  return [
    'PR (ci-smoke.yml): npm run auth → test:account-selection:ci → test:pr-gate (@smoke|@auth|@api-auth, excl. @account-selection)',
    'CI full (ci-full.yml): matrix smoke | auth | api-auth | regression (+ account-selection on auth lane)',
    'Nightly (nightly-regression.yml): auth → test:account-selection:ci → test:e2e:accounts → playwright --grep-invert @account-selection → qa:baseline',
  ];
}

function productRisks(): string[] {
  return [
    'Payment link create/list — no automated coverage (removed; rebuild API-first)',
    'Live transfer debit — happy path gated by TRANSFER_ACCOUNT_ID + TRANSFER_TRANSACTION_PIN',
    'Payment settings happy path — gated by PAYMENT_SETTINGS_ACCOUNT_ID + PAYMENT_SETTINGS_SETTING_ID',
    'MFA / locked / suspended users — api-auth specs skip without dedicated env users',
    'Account switch persistence after hard refresh — partial (UI switch test + API list validation)',
    'Visual regression — not in CI (VISUAL_REGRESSION opt-in removed from suite)',
  ];
}

function main(): void {
  const pwFiles = readFiles(path.join(root, 'tests'), /\.spec\.ts$/).map((f) =>
    path.relative(root, f).replace(/\\/g, '/')
  );
  const featureFiles = readFiles(path.join(root, 'e2e', 'features'), /\.feature$/);

  const counts: Record<Layer, number> = { api: 0, ui: 0, e2e: 0, setup: 0 };
  const byFile: { file: string; layer: Layer; tests: number }[] = [];

  for (const rel of pwFiles) {
    const layer = classifyPlaywrightFile(rel);
    const n = countPlaywrightTests(path.join(root, rel));
    counts[layer] += n;
    byFile.push({ file: rel, layer, tests: n });
  }

  let cucumber = 0;
  for (const f of featureFiles) {
    const n = countCucumberScenarios(f);
    cucumber += n;
    byFile.push({ file: path.relative(root, f).replace(/\\/g, '/'), layer: 'e2e', tests: n });
  }
  counts.e2e += cucumber;

  const executable = counts.api + counts.ui + counts.e2e;
  const pct = (n: number) => (executable ? ((n / executable) * 100).toFixed(1) : '0.0');

  let listTotal = '';
  try {
    listTotal =
      execSync('npx playwright test --list 2>&1', { cwd: root, encoding: 'utf8', maxBuffer: 4_000_000 })
        .split('\n')
        .find((l) => l.startsWith('Total:')) || '';
  } catch {
    listTotal = '(playwright --list failed)';
  }

  const tags = tagUsage();
  const unusedTags = tags.filter((t) => t.count === 0).map((t) => t.tag);

  const lines: string[] = [
    '# QA baseline report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Pyramid vs `docs/testing.md`',
    '',
    '| Layer | Target | Inventory | Share |',
    '|-------|--------|-----------|-------|',
    `| API | 70% | ${counts.api} | ${pct(counts.api)}% |`,
    `| UI | 20% | ${counts.ui} | ${pct(counts.ui)}% |`,
    `| E2E (Cucumber) | 10% | ${counts.e2e} | ${pct(counts.e2e)}% |`,
    `| Setup (infra) | — | ${counts.setup} | excluded |`,
    '',
    `**Playwright list:** ${listTotal}`,
    '',
    '## CI execution map',
    '',
    ...ciLanes().map((l) => `- ${l}`),
    '',
    '## Tag usage',
    '',
    '| Tag | References in specs/features |',
    '|-----|------------------------------|',
    ...tags.map((t) => `| ${t.tag} | ${t.count} |`),
    '',
    unusedTags.length
      ? `**Unused tags (0 references):** ${unusedTags.join(', ')}`
      : '**Unused tags:** none',
    '',
    '## Inventory by file',
    '',
    '| File | Layer | Tests |',
    '|------|-------|-------|',
    ...byFile
      .sort((a, b) => a.layer.localeCompare(b.layer) || a.file.localeCompare(b.file))
      .map((r) => `| ${r.file} | ${r.layer} | ${r.tests} |`),
    '',
    '## Product risks not fully covered',
    '',
    ...productRisks().map((r) => `- ${r}`),
    '',
    '## Quality signals (manual / nightly)',
    '',
    '- **Skip count:** run suite with `--reporter=list`; review `skipped` lines',
    '- **Flaky retries:** `retries: 1` in CI (`playwright.config.ts`)',
    '- **Duration:** JUnit at `reports/junit.xml` after CI',
    '- **Env missing:** happy-path API tests use `test.skip` with explicit reasons',
    '- **Risk covered:** each lane should map to a product area (auth, account context, transfer, settings, transactions UI)',
    '',
  ];

  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, 'qa-baseline.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  process.stdout.write(`Wrote ${outPath}\n`);
  process.stdout.write(
    `Pyramid: API ${counts.api} (${pct(counts.api)}%) | UI ${counts.ui} (${pct(counts.ui)}%) | E2E ${counts.e2e} (${pct(counts.e2e)}%)\n`
  );
}

main();
