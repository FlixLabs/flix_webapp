# Browser Regression Tests

## Dialog Transition Contract

Closing must invalidate requests and actions immediately, but must not clear
rendered titles, lists, selected values, feedback or footer buttons before
`closed` / `after-leave`. Use `useDialogSnapshot` for read-only presentation state
that must survive close-time resets; keep editable form state separate. Guard
after-leave cleanup against a dialog that has already reopened. Ignore late async
results after closing, including clipboard results. Do not use the open flag to
conditionally remove an entire dialog body during its transition.

Embedded players are an exception for resource lifetime, not layout: remove the
iframe immediately to stop playback, retain a fixed-size dark stage and the
surrounding content until after-leave, and hide the iframe until it has loaded.
`closeWithoutCollapsing` checks layout dimensions and text on every animation
frame, rather than checking only the first frame or the final hidden state.

Audit coverage includes trailers, media sheets/sharing and read-error feedback, release lists and their
confirmations, quality/deletion confirmations, download-client cleanup and its
confirmation, manual-import review/confirmation/status, collection sheets and
download/removal confirmations, request catalog/review dialogs and calendar days.

## Running

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
commit. Desktop runs all selected specs. Mobile keeps the cross-page safety net,
selected accessibility/layout checks and every changed E2E spec. Shared
runtime/fixture changes, unmapped application changes or lockfile changes trigger
all desktop scenarios with the same bounded mobile policy. An unavailable diff
and release tags still run the full desktop/mobile suite. Direct local Playwright
commands remain full desktop/mobile unless explicitly filtered.
Package metadata/version bumps alone keep the safety net; dependency resolution
changes are detected through `yarn.lock` and frozen installation remains required.
The component-to-scenario mappings and fallback feature groups are maintained in
`scripts/select-e2e-tests.mjs`. Known components use their direct scenario mapping
instead of accumulating every family matching their name (for example, a client
dialog does not also select all media and manual-import tests). Changed specs and
the safety net are still included. Missing mapped specs fail safe to full coverage.

The default branch only creates the release tag. Stable tags run `quality` and
the full desktop/mobile E2E suite in parallel before building and deploying.
This avoids repeating the full validation on both master and its tag.
No release build or deployment can bypass these two checks.

`sh scripts/run-e2e.sh` uses Docker, two workers and at most one retry. Local
runs default to the full suite. The CI suite budget scales with the fraction of
spec files selected: `ceil(45 * selected / total)` minutes, with a 15-minute
minimum and a 45-minute maximum. Full runs always get 45 minutes. This changes
only the suite budget, not individual test timeouts or selected coverage. The
entrypoint logs the chosen budget before starting Playwright. The runner needs Docker but
not Node or Chromium. Only `CI=true` and non-secret selection data are passed
to the container, never production configuration or credentials. The image
installs Chromium's headless shell, without also downloading the full browser.
Reports are copied into
`playwright-report/` and `test-results/`, even when tests fail; CI retains them
for seven days and displays `test-results/junit.xml` in its Tests tab.
Raw `.playwright-artifacts-*` directories left by interrupted workers are removed
and excluded from uploaded artifacts; finalized failure traces are preserved.
