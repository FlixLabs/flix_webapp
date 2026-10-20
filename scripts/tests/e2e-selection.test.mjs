import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectE2eTests, smokeTests } from '../select-e2e-tests.mjs';

const root = resolve(import.meta.dirname, '../..');
const available = readdirSync(join(root, 'tests/e2e')).filter(file => file.endsWith('.spec.ts')).map(file => 'tests/e2e/' + file);

test('CI-only changes keep a cross-page safety net instead of running every E2E', () => {
  const selection = selectE2eTests(['.gitlab-ci.yml', 'Dockerfile.e2e', 'scripts/run-e2e.sh', 'package.json'], available);
  assert.equal(selection.files.length, smokeTests.length);
  for (const name of smokeTests) assert.ok(selection.files.includes('tests/e2e/' + name + '.spec.ts'));
});
test('MR selection combines affected feature specs and changed tests', () => {
  const selection = selectE2eTests(['src/views/OutingsView.vue', 'tests/e2e/dashboard-details.spec.ts'], available);
  assert.ok(selection.files.includes('tests/e2e/outings-add.spec.ts'));
  assert.ok(selection.files.includes('tests/e2e/outings-responses.spec.ts'));
  assert.ok(selection.files.includes('tests/e2e/dashboard-details.spec.ts'));
  assert.ok(!selection.files.includes('tests/e2e/manual-import.spec.ts'));
  assert.ok(selection.files.length < available.length);
});
test('shared runtime, fixtures and unmapped source changes fail safe to full coverage', () => {
  for (const file of ['yarn.lock', 'src/App.vue', 'src/assets/flix.css',
    'src/i18n/fr.json', 'tests/e2e/fixtures.ts', 'src/composables/useUnmappedFeature.ts']) {
    assert.equal(selectE2eTests([file], available).files, null, file);
  }
});
test('deleted specs are ignored and duplicate changes do not duplicate execution', () => {
  const selected = selectE2eTests(['tests/e2e/deleted.spec.ts', 'tests/e2e/dashboard-actions.spec.ts',
    'tests/e2e/dashboard-actions.spec.ts'], available).files;
  assert.equal(selected.length, smokeTests.length);
  assert.throws(() => selectE2eTests([], []), /safety-net/);
});

test('the container entrypoint escapes paths, exports failures and removes only raw trace data', t => {
  const dir = mkdtempSync(join(tmpdir(), 'flix-e2e-entry-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const path of ['scripts', 'tests/e2e', 'node_modules/playwright', 'test-results/.playwright-artifacts-0/traces', 'test-results/failure']) {
    mkdirSync(join(dir, path), { recursive: true });
  }
  for (const file of ['run-e2e-tests.mjs', 'select-e2e-tests.mjs']) copyFileSync(join(root, 'scripts', file), join(dir, 'scripts', file));
  writeFileSync(join(dir, 'tests/e2e/dashboard-actions.spec.ts'), '');
  writeFileSync(join(dir, 'test-results/failure/trace.zip'), 'finalized trace');
  writeFileSync(join(dir, 'test-results/junit.xml'), 'report');
  writeFileSync(join(dir, 'node_modules/playwright/cli.js'),
    "require('fs').writeFileSync('arguments.json', JSON.stringify(process.argv.slice(2))); process.exit(7);");
  const result = spawnSync(process.execPath, ['scripts/run-e2e-tests.mjs'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, FLIX_E2E_SCOPE: 'changed', FLIX_E2E_CHANGED_FILES: '.gitlab-ci.yml',
  } });
  assert.equal(result.status, 7, result.stderr);
  const args = JSON.parse(readFileSync(join(dir, 'arguments.json'), 'utf8'));
  assert.deepEqual(args, ['test', 'tests/e2e/dashboard-actions\\.spec\\.ts$']);
  assert.equal(existsSync(join(dir, 'test-results/.playwright-artifacts-0')), false);
  assert.equal(readFileSync(join(dir, 'test-results/failure/trace.zip'), 'utf8'), 'finalized trace');
  assert.ok(existsSync(join(dir, 'test-results/junit.xml')));
});
