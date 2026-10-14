export interface QueueDetails {
  size?: number; sizeleft?: number; sizeLeft?: number;
  timeleft?: string | null; timeLeft?: string | null;
  status?: string; trackedDownloadStatus?: string; errorMessage?: string;
  statusMessages?: { title?: string; messages?: string[] }[];
  trackedDownloadState?: string;
  downloadId?: string;
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
export function showRawDownloadStatus(status: unknown, label: unknown) {
  return !!text(status) && text(status).toLocaleLowerCase() !== text(label).toLocaleLowerCase();
}
export function downloadDetails(item: QueueDetails) {
  const size = Number.isFinite(item.size) && (item.size ?? 0) > 0 ? item.size! : 0;
  const rawLeft = item.sizeleft ?? item.sizeLeft;
  const remaining = typeof rawLeft === 'number' && Number.isFinite(rawLeft) ? Math.max(0, Math.min(size, rawLeft)) : null;
  const ratio = size > 0 && remaining !== null ? Math.round((1 - remaining / size) * 10000) / 100 : 0;
  const messages = [...new Set([
    text(item.errorMessage),
    ...(Array.isArray(item.statusMessages) ? item.statusMessages : []).flatMap(message =>
      message && typeof message === 'object' ? [text(message.title), ...(Array.isArray(message.messages) ? message.messages.map(text) : [])] : []),
  ].filter(Boolean))];
  const state = text(item.trackedDownloadState).toLowerCase();
  const status = text(item.status).toLowerCase();
  const blocked = ['warning', 'error'].includes(text(item.trackedDownloadStatus).toLowerCase())
    || ['failed', 'error'].includes(status) || !!text(item.errorMessage)
    || ['importblocked', 'importfailed', 'downloadfailed'].includes(state);
  const diagnosis = blocked
    ? { kind: 'attention', label: ['importblocked', 'importfailed'].includes(state) ? 'Import needs attention' : 'Needs attention', color: 'warning', hint: 'Review the service messages. If the download is complete, use Manual Import to review its files before importing.' }
    : state === 'importing'
      ? { kind: 'waiting', label: 'Importing', color: 'info', hint: 'The service is importing the files. Wait for completion; do not remove the download during import.' }
      : status === 'paused'
        ? { kind: 'paused', label: 'Paused', color: 'info', hint: 'Resume this download in its download client. Flix does not control client pause/resume.' }
        : status === 'completed' || state === 'importpending'
          ? { kind: 'ready', label: state === 'imported' ? 'Imported' : 'Download complete', color: 'success', hint: state === 'imported' ? 'The files have been imported. The service is waiting for queue cleanup.' : 'Waiting for automatic import. Manual Import can review the downloaded files when available.' }
          : status === 'downloading'
            ? { kind: 'downloading', label: 'Downloading', color: 'primary', hint: '' }
            : { kind: 'waiting', label: 'Waiting', color: 'default', hint: 'Check the reported status and download client for more details.' };
  return {
    size, remaining, ratio, timeLeft: item.timeleft ?? item.timeLeft ?? null, messages,
    blocked, diagnosis, progressKnown: size > 0 && remaining !== null,
  };
}
