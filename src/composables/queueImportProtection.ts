import { requireList, requireObject, readApiJson } from './apiResponse';
import type { MediaServiceConfig } from './useMediaService';

export function queueImportBlock(state: unknown): string | null {
  const value = typeof state === 'string' ? state.toLowerCase() : '';
  if (value === 'importing') return 'Import in progress';
  if (value === 'importpending') return 'Import queued';
  return ['downloading', 'importblocked', 'imported', 'failedpending', 'failed', 'ignored', 'importfailed'].includes(value)
    ? null : 'Import status unavailable';
}

export function commandImportBlock(data: unknown, downloadId: string): string | null {
  const commands = requireList<Record<string, unknown>>(data, 'import commands', ['name', 'status']);
  for (const command of commands) {
    const name = String(command.name).toLowerCase();
    if (!['manualimport', 'downloadedmoviesscan', 'downloadedepisodesscan'].includes(name)) continue;
    const status = String(command.status).toLowerCase();
    if (['completed', 'failed', 'aborted', 'cancelled'].includes(status)) continue;
    if (!['queued', 'started'].includes(status)) return 'Import status unavailable';
    const body = command.body as { files?: { downloadId?: unknown }[]; downloadClientId?: unknown } | null;
    const ids = name === 'manualimport'
      ? (Array.isArray(body?.files) && body.files.length ? body.files.map(file => file?.downloadId) : [])
      : [body?.downloadClientId];
    if (!ids.length || ids.some(id => typeof id !== 'string' || !id.trim())) return 'Import status unavailable';
    if (ids.some(id => (id as string).trim().toLowerCase() === downloadId.toLowerCase())) return status === 'queued' ? 'Import queued' : 'Import in progress';
  }
  return null;
}

export async function readRemovalQueue(config: MediaServiceConfig, signal: AbortSignal) {
  const records: Record<string, unknown>[] = [];
  const seen = new Set<number>();
  let total: number | undefined;
  for (let page = 1; page <= 100; page++) {
    if (signal.aborted) throw new Error('Import verification aborted');
    const params = new URLSearchParams({ page: String(page), pageSize: '100', includeUnknownMovieItems: 'true', includeUnknownSeriesItems: 'true' });
    const response = await fetch(`${config.base_url}/api/v3/queue?${params}`, { headers: { 'X-Api-Key': config.api_key }, signal, cache: 'no-store', redirect: 'error' });
    const data = requireObject(await readApiJson(response), 'download queue');
    if (signal.aborted) throw new Error('Import verification aborted');
    const batch = requireList<Record<string, unknown>>(data.records, 'download queue');
    if (!Number.isSafeInteger(data.totalRecords) || Number(data.totalRecords) < 0 || batch.length > 100
      || (total !== undefined && total !== data.totalRecords)) throw new Error('Invalid download queue');
    total = Number(data.totalRecords);
    for (const item of batch) {
      if (!Number.isSafeInteger(item.id) || seen.has(item.id as number)) throw new Error('Invalid queue identity');
      seen.add(item.id as number);
      records.push(item);
    }
    if (records.length === total) return records;
    if (!batch.length || records.length > total) break;
  }
  throw new Error('Incomplete download queue');
}
