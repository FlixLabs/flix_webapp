# Browser Regression Tests

Run `yarn install --frozen-lockfile`, `yarn playwright install chromium`, then `yarn test:e2e`.

The suite starts a dedicated Vite server and intercepts API requests. No real downloads,
deletions or credentials are used. Desktop and mobile Chromium projects cover Library,
Calendar, Downloads and Settings. Failure traces and screenshots are saved locally.

Optional variables:
- `PW_BROWSER_PATH`: use an already installed Chromium executable.
- `FLIX_E2E_ROOT`: test another checkout/worktree with the same suite.
- `FLIX_E2E_PORT`: use a different test server port (default: 5180).
- `FLIX_E2E_FEATURE`: run the additional feature checks (`library`, `episode`,
  `downloads`, `dashboard`, `preferences`, `accessibility`, or `all`).

Without a test-file or grep filter, the entire desktop/mobile suite runs.
Native window errors, including ResizeObserver loops, fail the tests.

Do not point this suite at production. All remote requests are mocked.

The blocking GitLab `e2e` job runs a cross-page safety net and affected feature
specs on merge requests. Selection uses the complete MR diff, not just the last
commit. Changed E2E specs are always included. Shared runtime/fixture changes,
unmapped application changes, lockfile changes or an unavailable diff trigger the full suite.
Package metadata/version bumps alone keep the safety net; dependency resolution
changes are detected through `yarn.lock` and frozen installation remains required.
The feature-to-test groups are maintained in `scripts/select-e2e-tests.mjs`.

The default branch only creates the release tag. Stable tags run `quality` and
the full desktop/mobile E2E suite in parallel before building and deploying.
This avoids repeating the full validation on both master and its tag.
No release build or deployment can bypass these two checks.

`sh scripts/run-e2e.sh` uses Docker, two workers and at most one retry. Local
runs default to the full suite. CI budgets are 15 minutes for targeted runs and
45 minutes for full runs (not a per-test timeout). The runner needs Docker but
not Node or Chromium. Only `CI=true` and non-secret selection data are passed
to the container, never production configuration or credentials. The image
installs Chromium's headless shell, without also downloading the full browser.
Reports are copied into
`playwright-report/` and `test-results/`, even when tests fail; CI retains them
for seven days and displays `test-results/junit.xml` in its Tests tab.
Raw `.playwright-artifacts-*` directories left by interrupted workers are removed
and excluded from uploaded artifacts; finalized failure traces are preserved.
