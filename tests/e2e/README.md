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

Without `FLIX_E2E_FEATURE`, all 24 desktop/mobile checks run.
Native window errors, including ResizeObserver loops, fail the tests.

Do not point this suite at production. All remote requests are mocked.
