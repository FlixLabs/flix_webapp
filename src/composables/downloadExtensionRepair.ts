import type { ImportDownload } from './useManualImport';

export function hasUnsupportedExtension(download: ImportDownload) {
  return download.status?.toLowerCase() === 'completed'
    && ['importpending', 'importblocked', 'importfailed'].includes(download.trackedDownloadState?.toLowerCase() ?? '')
    && typeof download.trackedDownloadStatus === 'string' && download.trackedDownloadStatus.toLowerCase() === 'warning'
    && (download.errorMessage == null || download.errorMessage === '')
    && Array.isArray(download.statusMessages) && download.statusMessages.length > 0
    && download.statusMessages.every(group => Array.isArray(group?.messages) && group.messages.length > 0
      && group.messages.every((message: unknown) => typeof message === 'string'
        && /^Invalid video file, unsupported extension: '(?:\.[^'\/\\\r\n]+)?'$/.test(message.trim())));
}

export interface ExtensionReview { reviewId: string; originalName: string; proposedName: string; format: 'matroska' }
export function parseExtensionReview(data: unknown): ExtensionReview {
  const item = data as ExtensionReview | null;
  if (!item || typeof item.reviewId !== 'string' || !/^[a-f0-9]{64}$/.test(item.reviewId) || typeof item.originalName !== 'string'
    || !item.originalName || item.proposedName !== item.originalName + '.mkv' || item.format !== 'matroska') {
    throw new Error('Invalid extension review.');
  }
  return item;
}
