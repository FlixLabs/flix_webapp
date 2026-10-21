import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { selectE2eTests, selectMobileE2eTests, smokeTests, e2eTimeoutMs } from '../select-e2e-tests.mjs';

const root = resolve(import.meta.dirname, '../..');
const available = readdirSync(join(root, 'tests/e2e')).filter(file => file.endsWith('.spec.ts')).map(file => 'tests/e2e/' + file);

test('MR mobile coverage keeps the safety net, selected layout checks and every changed spec', () => {
  const changed = ['src/components/common/MediaDialog.vue', 'tests/e2e/media-history.spec.ts'];
  const selected = selectE2eTests(changed, available).files;
  const mobile = selectMobileE2eTests(changed, selected, available);
  for (const name of [...smokeTests, 'dialog-harmony', 'media-dialog-scroll', 'media-history']) {
    assert.ok(mobile.includes('tests/e2e/' + name + '.spec.ts'), name);
  }
  assert.ok(!mobile.includes('tests/e2e/dashboard-details.spec.ts'));
  assert.ok(mobile.length < selected.length);
});

test('shared MR changes retain full desktop selection but bounded mobile coverage', () => {
  const changed = ['src/i18n/fr.json'];
  assert.equal(selectE2eTests(changed, available).files, null);
  const mobile = selectMobileE2eTests(changed, null, available);
  assert.ok(mobile.includes('tests/e2e/accessibility.spec.ts'));
  assert.ok(mobile.includes('tests/e2e/regressions.spec.ts'));
  assert.ok(mobile.length < available.length / 2);
});

test('suite budgets scale with selected coverage without changing test coverage', () => {
  assert.equal(e2eTimeoutMs(['one'], 64), 15 * 60000);
  assert.equal(e2eTimeoutMs(Array(49).fill('spec'), 64), 35 * 60000);
  assert.equal(e2eTimeoutMs(Array(49).fill('spec'), 65), 34 * 60000);
  assert.equal(e2eTimeoutMs(Array(64).fill('spec'), 64), 45 * 60000);
  assert.equal(e2eTimeoutMs(null, 64), 45 * 60000);
  assert.equal(e2eTimeoutMs([], 0), 45 * 60000);
});

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
test('known dialogs select their direct scenarios without expanding overlapping feature families', () => {
  const clients = selectE2eTests(['src/components/common/DownloadClientsDialog.vue',
    'src/composables/useDownloadClients.ts'], available).files;
  assert.deepEqual(clients, [...new Set([...smokeTests, 'download-clients', 'download-client-refresh'])]
    .map(name => 'tests/e2e/' + name + '.spec.ts').sort());
  const review = selectE2eTests(['src/components/common/RequestReviewDialog.vue'], available).files;
  assert.ok(review.includes('tests/e2e/media-requests.spec.ts'));
  assert.ok(!review.includes('tests/e2e/user-invitations.spec.ts'));
  assert.ok(!review.includes('tests/e2e/media-history.spec.ts'));
  const releases = selectE2eTests(['src/components/common/ReleaseSelectionDialog.vue'], available).files;
  assert.ok(releases.includes('tests/e2e/release-association.spec.ts'));
  assert.ok(!releases.includes('tests/e2e/media-monitoring.spec.ts'));
  assert.ok(!releases.includes('tests/e2e/collection-removal.spec.ts'));
});
test('the closing-dialog MR stays bounded and keeps changed specs and direct regressions', () => {
  const selection = selectE2eTests([
    'package.json', 'src/components/MediaRequests.vue',
    ...['DeleteConfirmationDialog', 'DownloadClientsDialog', 'LibraryCollections', 'MediaDialog',
      'QualitySelectionDialog', 'ReleaseSelectionDialog', 'RequestReviewDialog']
      .map(name => 'src/components/common/' + name + '.vue'),
    'src/composables/useDownloadClients.ts', 'src/composables/useReleaseSearch.ts',
    ...['download-client-refresh', 'media-requests', 'multilingual', 'outings-add', 'regressions', 'release-pagination']
      .map(name => 'tests/e2e/' + name + '.spec.ts'),
  ], available);
  assert.ok(selection.files);
  assert.ok(selection.files.length <= 20, selection.files.join('\n'));
  for (const spec of ['multilingual', 'release-association', 'download-clients', 'collections', 'media-dialog-scroll']) {
    assert.ok(selection.files.includes('tests/e2e/' + spec + '.spec.ts'), spec);
  }
  for (const spec of ['manual-import', 'library-bulk-actions', 'media-monitoring', 'user-invitations']) {
    assert.ok(!selection.files.includes('tests/e2e/' + spec + '.spec.ts'), spec);
  }
});
test('missing mapped specs and unknown dialogs fall back to full coverage', () => {
  assert.equal(selectE2eTests(['src/components/common/DownloadClientsDialog.vue'],
    available.filter(file => !file.endsWith('/download-clients.spec.ts'))).files, null);
  assert.equal(selectE2eTests(['src/components/common/UnknownDialog.vue'], available).files, null);
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
    "require('fs').writeFileSync('arguments.json', JSON.stringify(process.argv.slice(2))); require('fs').writeFileSync('budget.txt', process.env.FLIX_E2E_TIMEOUT_MS); require('fs').writeFileSync('mobile.json', process.env.FLIX_E2E_MOBILE_FILES || 'null'); process.exit(7);");
  const result = spawnSync(process.execPath, ['scripts/run-e2e-tests.mjs'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, FLIX_E2E_SCOPE: 'changed', FLIX_E2E_CHANGED_FILES: '.gitlab-ci.yml',
  } });
  assert.equal(result.status, 7, result.stderr);
  const args = JSON.parse(readFileSync(join(dir, 'arguments.json'), 'utf8'));
  assert.deepEqual(args, ['test', 'tests/e2e/dashboard-actions\\.spec\\.ts$']);
  assert.equal(readFileSync(join(dir, 'budget.txt'), 'utf8'), String(45 * 60000));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'mobile.json'), 'utf8')), ['tests/e2e/dashboard-actions.spec.ts']);
  assert.equal(existsSync(join(dir, 'test-results/.playwright-artifacts-0')), false);
  assert.equal(readFileSync(join(dir, 'test-results/failure/trace.zip'), 'utf8'), 'finalized trace');
  assert.ok(existsSync(join(dir, 'test-results/junit.xml')));
  const specs = ['tests/e2e/dashboard-actions.spec.ts'];
  for (let index = 1; index < 65; index++) {
    const file = 'tests/e2e/example-' + index + '.spec.ts';
    writeFileSync(join(dir, file), '');
    specs.push(file);
  }
  for (const [changes, count, minutes] of [
    ['.gitlab-ci.yml', 1, 15],
    [specs.slice(0, 49).join('\n'), 49, 34],
    ['src/i18n/fr.json', 0, 45],
  ]) {
    const run = spawnSync(process.execPath, ['scripts/run-e2e-tests.mjs'], { cwd: dir, encoding: 'utf8', env: {
      ...process.env, FLIX_E2E_SCOPE: 'changed', FLIX_E2E_CHANGED_FILES: changes,
    } });
    assert.equal(run.status, 7, run.stderr);
    assert.equal(readFileSync(join(dir, 'budget.txt'), 'utf8'), String(minutes * 60000));
    assert.equal(JSON.parse(readFileSync(join(dir, 'arguments.json'), 'utf8')).length, 1 + count);
    assert.match(run.stdout, new RegExp('Suite budget: ' + minutes + ' minutes'));
  }
  const full = spawnSync(process.execPath, ['scripts/run-e2e-tests.mjs'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, FLIX_E2E_SCOPE: 'full', FLIX_E2E_MOBILE_FILES: '[]',
  } });
  assert.equal(full.status, 7, full.stderr);
  assert.equal(readFileSync(join(dir, 'mobile.json'), 'utf8'), 'null');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'arguments.json'), 'utf8')), ['test']);
});
