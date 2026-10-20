// Keep a small cross-page safety net even for documentation and CI-only changes.
export const smokeTests = ['api-session', 'login-loading', 'dashboard-actions', 'global-navigation'];
const groups = [
  [/dashboard/i, /^(dashboard-|media-sheet-navigation)/],
  [/library/i, /^(library-|collection|media-counts|media-badges)/],
  [/outings|tmdb|upcoming/i, /^(outings-|upcoming-|multilingual)/],
  [/calendar/i, /^(calendar-|regressions)/],
  [/download|manualimport/i, /^(download|manual-import|network-resilience)/],
  [/release/i, /^(release-|regressions|loading-colors)/],
  [/trailer/i, /^(trailers|media-dialog-scroll|dialog-harmony)/],
  [/collection/i, /^collection/],
  [/storage|system|integration/i, /^(storage-|system-|integration-status)/],
  [/settings|theme|color/i, /^(media-settings|button-colors|regressions|loading-colors)/],
  [/media|movie|series|episode|dialog/i, /^(media-|dashboard-details|dialog-harmony|season-|accessibility|upcoming-|download-media-sheet|collection)/],
  [/auth|login|session|user|request/i, /^(api-session|login-|user-|media-requests|media-links)/],
];

export function selectE2eTests(changedFiles, available) {
  const selected = new Set(available.filter(file => smokeTests.some(name => file === 'tests/e2e/' + name + '.spec.ts')));
  for (const file of changedFiles) {
    if (file.startsWith('tests/e2e/') && file.endsWith('.spec.ts')) {
      if (available.includes(file)) selected.add(file);
      continue;
    }
    if (file === 'tests/e2e/README.md') continue;
    // Shared test fixtures and runtime/configuration changes can affect every page.
    if (file.startsWith('tests/e2e/') || /^(?:yarn\.lock|vite\.config\.ts|src\/(?:App\.vue|main\.ts|assets\/|stores\/|router\/|i18n\/))/.test(file)) {
      return { files: null, reason: 'Shared runtime or fixture changed: ' + file };
    }
    if (!file.startsWith('src/')) continue;
    const matches = groups.filter(([source]) => source.test(file));
    if (!matches.length) return { files: null, reason: 'Unmapped application change: ' + file };
    for (const test of available) {
      const name = test.slice('tests/e2e/'.length);
      if (matches.some(([, pattern]) => pattern.test(name))) selected.add(test);
    }
  }
  if (!selected.size) throw new Error('No E2E safety-net tests found');
  return { files: [...selected].sort(), reason: 'MR safety net and affected feature scenarios' };
}
