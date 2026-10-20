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

The blocking GitLab `e2e` job runs the full suite on merge requests, the default
branch and stable release tags. It uses `sh scripts/run-e2e.sh` with Docker,
two workers and two retries. The runner needs Docker but not Node or Chromium.
The same script can be run locally; its container receives only `CI=true`, not
your shell's production configuration or credentials. Reports are copied into
`playwright-report/` and `test-results/`, even when tests fail; CI retains them
for seven days and displays `test-results/junit.xml` in its Tests tab.
