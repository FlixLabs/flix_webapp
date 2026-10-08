export interface QueueDetails {
  size?: number; sizeleft?: number; sizeLeft?: number;
  timeleft?: string | null; timeLeft?: string | null;
  status?: string; trackedDownloadStatus?: string; errorMessage?: string;
  statusMessages?: { title?: string; messages?: string[] }[];
}
export function downloadDetails(item: QueueDetails) {
  const size = Number.isFinite(item.size) && (item.size ?? 0) > 0 ? item.size! : 0;
  const rawLeft = item.sizeleft ?? item.sizeLeft;
  const remaining = typeof rawLeft === 'number' && Number.isFinite(rawLeft) ? Math.max(0, Math.min(size, rawLeft)) : null;
  const ratio = size > 0 && remaining !== null ? Math.round((1 - remaining / size) * 10000) / 100 : 0;
  const messages = [...new Set([
    item.errorMessage,
    ...(item.statusMessages ?? []).flatMap(message => [message.title, ...(message.messages ?? [])]),
  ].filter((message): message is string => !!message?.trim()))];
  return {
    size, remaining, ratio, timeLeft: item.timeleft ?? item.timeLeft ?? null, messages,
    blocked: ['warning', 'error'].includes((item.trackedDownloadStatus ?? '').toLowerCase())
      || ['failed', 'error'].includes((item.status ?? '').toLowerCase()) || !!item.errorMessage,
  };
}
