// Keep a small cross-page safety net even for documentation and CI-only changes.
export const smokeTests = ['api-session', 'login-loading', 'dashboard-actions', 'global-navigation'];

export function selectMobileE2eTests(changedFiles, selectedFiles, available) {
  const changed = new Set(changedFiles);
  const selected = new Set(selectedFiles ?? available);
  return available.filter(file => selected.has(file) && (
    smokeTests.includes(file.slice('tests/e2e/'.length, -'.spec.ts'.length))
    || file === 'tests/e2e/regressions.spec.ts'
    || /(?:accessibility|layout|dialog-harmony|media-dialog-scroll|media-badges|media-card-height)\.spec\.ts$/.test(file)
    || changed.has(file)
  )).sort();
}

export function e2eTimeoutMs(files, availableCount) {
  const minutes = files && availableCount > 0
    ? Math.max(15, Math.min(45, Math.ceil(45 * files.length / availableCount)))
    : 45;
  return minutes * 60 * 1000;
}
// Specific components take precedence over broad page/feature families. A dialog
// name must not select every media, download and request scenario at once.
const componentScenarios = [
  [/^(DownloadClientsDialog|useDownloadClients)$/, ['download-clients', 'download-client-refresh']],
  [/^(ManualImportDialog|ManualImportStatus|ManualImportActivity|useManualImport|manualImportTracking|importMediaSuggestions)$/, ['manual-import', 'manual-import-pending']],
  [/^(ReleaseSelectionDialog|useReleaseSearch)$/, ['release-pagination', 'release-association', 'release-download-errors', 'release-source-links']],
  [/^DeleteConfirmationDialog$/, ['regressions']],
  [/^useDeleteConfirmation$/, ['regressions', 'download-import-protection']],
  [/^(QualitySelectionDialog|useQualitySelection)$/, ['outings-add']],
  [/^useQualityProfiles$/, ['outings-add', 'dashboard-details', 'media-settings']],
  [/^MediaDialog$/, ['dialog-harmony', 'media-dialog-scroll', 'dashboard-details']],
  [/^(DialogSheet|DialogScrollHint|useDialogScroll|useDialogActivator|useDialog)$/, ['dialog-harmony', 'media-dialog-scroll', 'accessibility']],
  [/^LibraryCollections$/, ['collections', 'collection-sheet-refresh']],
  [/^(CollectionDownloadDialog|useCollectionDownloads)$/, ['collection-downloads']],
  [/^(CollectionRemovalDialog|useCollectionRemoval)$/, ['collection-removal']],
  [/^(MediaRequests|RequestReviewDialog|mediaRequests)$/, ['media-requests']],
  [/^(useLocalizedMedia|LocalizedMedia|LocalizedEpisode)$/, ['multilingual']],
  [/^(MediaShareLink|mediaLinks|useMediaSheetRoute)$/, ['media-links']],
  [/^(MediaHistory|useMediaHistory)$/, ['media-history']],
  [/^(MediaFileDetails|mediaFileDetails)$/, ['media-file-details']],
  [/^(MediaMonitoring|useMediaMonitoring)$/, ['media-monitoring']],
  [/^(MediaSettings|useMediaSettings)$/, ['media-settings']],
  [/^(useMediaSheetRefresh|useCollectionSheetRefresh)$/, ['media-sheet-refresh', 'collection-sheet-refresh']],
  [/^(queueImportProtection|useDownloadActions)$/, ['download-import-protection', 'manual-import']],
];
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
  [/media|movie|series|episode/i, /^(media-|dashboard-details|dialog-harmony|season-|accessibility|upcoming-|download-media-sheet|collection)/],
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
    const name = file.split('/').at(-1).replace(/\.(vue|ts)$/, '');
    const component = componentScenarios.find(([pattern]) => pattern.test(name));
    if (component) {
      for (const scenario of component[1]) {
        const spec = 'tests/e2e/' + scenario + '.spec.ts';
        if (!available.includes(spec)) return { files: null, reason: 'Mapped E2E spec missing: ' + spec };
        selected.add(spec);
      }
      continue;
    }
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
