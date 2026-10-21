import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'flix-e2e-runner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'scripts'));
  mkdirSync(join(dir, 'bin'));
  copyFileSync(join(root, 'scripts/run-e2e.sh'), join(dir, 'scripts/run-e2e.sh'));
  writeFileSync(join(dir, '.dockerignore'), '.env\n');
  writeFileSync(join(dir, 'yarn.lock'), 'playwright@1.64.0:\n  version "1.64.0"\n');
  writeFileSync(join(dir, 'bin/git'), [
    '#!/bin/sh',
    'if [ "$1" = cat-file ]; then exit "$DIFF_AVAILABLE"; fi',
    'printf "%s\\n" "$TEST_CHANGED_FILES"',
    'exit "$DIFF_EXIT"',
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(join(dir, 'bin/docker'), [
    '#!/bin/sh',
    'printf "%s\\n" "$*" >> docker.log',
    'case "$1" in',
    '  build) exit "$BUILD_EXIT" ;;',
    '  run) touch container-created; exit "$TEST_EXIT" ;;',
    '  container) test -f container-created ;;',
    '  cp)',
    '    test "$COPY_EXIT" = 0 || exit "$COPY_EXIT"',
    '    printf "report" > "$3/copied-report"',
    '    ;;',
    'esac',
    '',
  ].join('\n'), { mode: 0o755 });
  return dir;
}

function run(dir, overrides = {}) {
  return spawnSync('sh', ['scripts/run-e2e.sh'], { cwd: dir, encoding: 'utf8', env: {
    ...process.env, PATH: dir + '/bin:' + process.env.PATH, CI_JOB_ID: '1234',
    BUILD_EXIT: '0', TEST_EXIT: '0', COPY_EXIT: '0', DIFF_AVAILABLE: '0', DIFF_EXIT: '0',
    CI_PIPELINE_SOURCE: '', CI_MERGE_REQUEST_DIFF_BASE_SHA: '', TEST_CHANGED_FILES: '', ...overrides,
  } });
}

for (const status of [0, 1, 137]) {
  test('E2E runner exports reports and cleans its own resources after exit ' + status, t => {
    const dir = fixture(t);
    const result = run(dir, { TEST_EXIT: String(status) });
    assert.equal(result.status, status, result.stderr);
    const log = readFileSync(join(dir, 'docker.log'), 'utf8');
    assert.ok(log.includes('build -f Dockerfile.e2e --build-arg PLAYWRIGHT_VERSION=1.64.0 -t flix-webapp-e2e:1234 .'));
    assert.ok(log.includes('run --name flix-webapp-e2e-1234 --init --shm-size=1g --env CI=true'));
    assert.ok(log.includes('--env FLIX_E2E_SCOPE=full'));
    assert.doesNotMatch(log, /--rm|--volume|--privileged|--env-file|VITE_|REGISTRY_|TOKEN|PASSWORD/);
    assert.ok(log.includes('cp flix-webapp-e2e-1234:/app/playwright-report/. playwright-report/'));
    assert.ok(log.includes('cp flix-webapp-e2e-1234:/app/test-results/. test-results/'));
    assert.ok(log.includes('rm -f flix-webapp-e2e-1234'));
    assert.ok(log.includes('image rm flix-webapp-e2e:1234'));
    assert.ok(existsSync(join(dir, 'test-results/copied-report')));
    assert.ok(existsSync(join(dir, 'playwright-report/copied-report')));
    assert.equal(readFileSync(join(dir, '.dockerignore'), 'utf8'), '.env\n');
  });
}

test('E2E runner preserves build failures without starting a container', t => {
  const dir = fixture(t);
  assert.equal(run(dir, { BUILD_EXIT: '7' }).status, 7);
  assert.doesNotMatch(readFileSync(join(dir, 'docker.log'), 'utf8'), /^run |^cp /m);
});

test('E2E runner refuses an unresolved browser version before building', t => {
  const dir = fixture(t);
  writeFileSync(join(dir, 'yarn.lock'), '');
  assert.equal(run(dir).status, 1);
  assert.doesNotMatch(readFileSync(join(dir, 'docker.log'), 'utf8'), /^build |^run /m);
});

test('E2E runner fails if reports cannot be extracted and preserves a test failure', t => {
  for (const status of [0, 42]) {
    const dir = fixture(t);
    assert.equal(run(dir, { COPY_EXIT: '1', TEST_EXIT: String(status) }).status, status || 1);
  }
});

test('MR diff is passed as data, with full coverage if its base or diff is unavailable', t => {
  const dir = fixture(t);
  const env = { CI_PIPELINE_SOURCE: 'merge_request_event', CI_MERGE_REQUEST_DIFF_BASE_SHA: 'a'.repeat(40),
    TEST_CHANGED_FILES: 'src/views/OutingsView.vue\ntests/e2e/dashboard-details.spec.ts' };
  assert.equal(run(dir, env).status, 0);
  assert.match(readFileSync(join(dir, 'docker.log'), 'utf8'), /FLIX_E2E_SCOPE=changed/);
  assert.ok(readFileSync(join(dir, 'docker.log'), 'utf8').includes(env.TEST_CHANGED_FILES));
  for (const overrides of [{ CI_MERGE_REQUEST_DIFF_BASE_SHA: '' }, { DIFF_AVAILABLE: '1' }, { DIFF_EXIT: '1' }]) {
    writeFileSync(join(dir, 'docker.log'), '');
    assert.equal(run(dir, { ...env, ...overrides }).status, 0);
    assert.match(readFileSync(join(dir, 'docker.log'), 'utf8'), /FLIX_E2E_SCOPE=full/);
  }
});

test('E2E gates tag builds without duplicating master validation and exports bounded reports', () => {
  const ci = readFileSync(join(root, '.gitlab-ci.yml'), 'utf8');
  const e2e = ci.split('\ne2e:\n')[1].split('\ncreate_release_tag:')[0];
  assert.match(e2e, /stage: quality/);
  assert.ok(e2e.includes('needs: []'));
  assert.ok(e2e.includes('sh scripts/run-e2e.sh'));
  assert.match(e2e, /when: always/);
  assert.match(e2e, /expire_in: 7 days/);
  assert.ok(e2e.includes('playwright-report/'));
  assert.ok(e2e.includes('junit: test-results/junit.xml'));
  assert.match(e2e, /merge_request_event/);
  assert.doesNotMatch(e2e, /CI_DEFAULT_BRANCH/);
  assert.match(e2e, /CI_COMMIT_TAG/);
  assert.doesNotMatch(e2e, /allow_failure: true|when: manual|VITE_|docker login|docker push/);
  assert.ok(e2e.includes('test-results/.playwright-artifacts-*/**/*'));
  const quality = ci.split('\nquality:\n')[1].split('\ne2e:')[0];
  assert.doesNotMatch(quality, /CI_DEFAULT_BRANCH/);
  const tag = ci.split('\ncreate_release_tag:\n')[1].split('\nbuild:')[0];
  assert.match(tag, /needs: \[\]/);
  assert.doesNotMatch(tag, /job: quality|job: e2e/);
  const build = ci.split('\nbuild:\n')[1].split('\ndeploy:')[0];
  assert.match(build, /job: quality/);
  assert.match(build, /job: e2e/);
  assert.equal(build.match(/artifacts: false/g)?.length, 2);
  const dockerfile = readFileSync(join(root, 'Dockerfile.e2e'), 'utf8');
  assert.match(dockerfile, /yarn install --frozen-lockfile/);
  assert.match(dockerfile, /npm exec --yes --package="playwright@\$PLAYWRIGHT_VERSION" -- playwright install --with-deps --only-shell chromium/);
  assert.ok(dockerfile.indexOf('playwright install') < dockerfile.indexOf('COPY package.json yarn.lock'));
  assert.match(dockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.ok(dockerfile.includes('CMD ["node", "scripts/run-e2e-tests.mjs"]'));
  assert.doesNotMatch(dockerfile, /ARG VITE_|ENV VITE_|COPY .*\.env/);
  const config = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
  assert.ok(config.includes('forbidOnly: !!process.env.CI'));
  assert.ok(config.includes("outputFile: 'test-results/junit.xml'"));
});
