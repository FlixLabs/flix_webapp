import { readdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { selectE2eTests, selectReleaseE2eTests, selectMobileE2eTests, e2eTimeoutMs } from './select-e2e-tests.mjs';

const available = readdirSync('tests/e2e').filter(file => file.endsWith('.spec.ts')).map(file => 'tests/e2e/' + file);
const scope = process.env.FLIX_E2E_SCOPE || 'full';
if (!['full', 'changed', 'smoke'].includes(scope)) throw new Error('Invalid E2E scope');
const changedFiles = (process.env.FLIX_E2E_CHANGED_FILES || '').split('\n').filter(Boolean);
const selection = scope === 'changed'
  ? selectE2eTests(changedFiles, available)
  : scope === 'smoke' ? selectReleaseE2eTests(available)
  : { files: null, reason: 'Full scheduled/manual/local validation' };
console.log('[e2e] ' + selection.reason);
if (selection.files) console.log('[e2e] ' + selection.files.join(', '));
// Playwright treats file arguments as regexes, not literal paths.
const filters = selection.files?.map(file => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') || [];
if (!selection.files) process.env.FLIX_E2E_SCOPE = 'full';
if (scope === 'changed') {
  const mobile = selectMobileE2eTests(changedFiles, selection.files, available);
  process.env.FLIX_E2E_MOBILE_FILES = JSON.stringify(mobile);
  console.log('[e2e] MR coverage: desktop ' + (selection.files?.length ?? available.length)
    + ' spec files; mobile ' + mobile.length + ' critical/layout/changed spec files');
} else {
  delete process.env.FLIX_E2E_MOBILE_FILES;
  console.log('[e2e] ' + (scope === 'smoke' ? 'Critical' : 'Full') + ' desktop and mobile coverage');
}
process.env.FLIX_E2E_TIMEOUT_MS = String(e2eTimeoutMs(selection.files, available.length));
console.log('[e2e] Suite budget: ' + Number(process.env.FLIX_E2E_TIMEOUT_MS) / 60000 + ' minutes ('
  + (selection.files?.length ?? available.length) + '/' + available.length + ' spec files)');
const result = spawnSync(process.execPath, ['node_modules/playwright/cli.js', 'test', ...filters, ...process.argv.slice(2)], { stdio: 'inherit' });
// A global timeout can leave thousands of raw trace resources behind. Finalized
// trace.zip files, screenshots, HTML and JUnit are stored outside these folders.
if (existsSync('test-results')) {
  for (const entry of readdirSync('test-results', { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('.playwright-artifacts-')) {
      rmSync('test-results/' + entry.name, { recursive: true, force: true });
    }
  }
}
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
