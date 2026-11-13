import { expect, it } from 'vitest';
import { hasUnsupportedExtension, parseExtensionReview } from '@/composables/downloadExtensionRepair';

const download = { title: 'Movie.Groupe', downloadId: 'a'.repeat(40), status: 'completed',
  trackedDownloadState: 'importPending', trackedDownloadStatus: 'warning',
  statusMessages: [{ title: 'Movie.Groupe', messages: ["Invalid video file, unsupported extension: '.Groupe'"] }] };
it('offers verification only for an explicit completed unsupported-extension rejection', () => {
  expect(hasUnsupportedExtension(download)).toBe(true);
  expect(hasUnsupportedExtension({ ...download, statusMessages: [{ messages: ["Invalid video file, unsupported extension: ''"] }] })).toBe(true);
  expect(hasUnsupportedExtension({ ...download, trackedDownloadState: 'importBlocked' })).toBe(true);
  for (const changes of [{ status: 'downloading' }, { trackedDownloadState: 'importing' },
    { trackedDownloadStatus: 'ok' }, { errorMessage: 'Import running' }, { statusMessages: [] },
    { statusMessages: [{ title: download.statusMessages[0]!.messages[0], messages: [] }] },
    { statusMessages: [{ messages: [...download.statusMessages[0]!.messages, 'Waiting for import'] }] }]) {
    expect(hasUnsupportedExtension({ ...download, ...changes })).toBe(false);
  }
});
it('requires a confirmation identity and exactly the proposed Matroska suffix', () => {
  const review = { reviewId: 'a'.repeat(64), originalName: 'Movie.Groupe', proposedName: 'Movie.Groupe.mkv', format: 'matroska' };
  expect(parseExtensionReview(review)).toEqual(review);
  for (const changes of [{ reviewId: '' }, { originalName: '' }, { proposedName: '../Other.mkv' }, { format: 'webm' }]) {
    expect(() => parseExtensionReview({ ...review, ...changes })).toThrow();
  }
  expect(() => parseExtensionReview(null)).toThrow();
});
