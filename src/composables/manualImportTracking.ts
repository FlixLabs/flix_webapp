import { ref } from 'vue';
import CryptoJS from 'crypto-js';
import { readApiJson, requireObject } from './apiResponse';
import type { MediaServiceConfig, MediaType } from './useMediaService';

const storageKey = 'flix:manual-imports:v1';
export type ImportStatus = 'queued' | 'started' | 'completed' | 'failed' | 'aborted' | 'cancelled' | 'unknown';
export interface TrackedImport {
  key: string; service: string; download: string; type: MediaType; title: string;
  commandId: number; status: ImportStatus; createdAt: number; error: string;
}
const statuses = ['queued', 'started', 'completed', 'failed', 'aborted', 'cancelled', 'unknown'];
function restore(): TrackedImport[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item === 'object' && /^[a-f0-9]{64}$/.test(item.service)
      && /^[a-f0-9]{64}$/.test(item.download) && ['movies', 'series'].includes(item.type)
      && Number.isSafeInteger(item.commandId) && item.commandId > 0 && item.key === `${item.service}:${item.commandId}`
      && typeof item.title === 'string' && typeof item.error === 'string' && statuses.includes(item.status)
      && Number.isFinite(item.createdAt) && item.createdAt > Date.now() - 7 * 86400000).slice(-100);
  } catch { return []; }
}
export const trackedImports = ref<TrackedImport[]>(restore());
export const importInProgress = (status: ImportStatus) => status === 'queued' || status === 'started';
export function importStatusLabel(status: ImportStatus) {
  return ({ queued: 'Queued', started: 'Importing', completed: 'Completed', failed: 'Failed', aborted: 'Aborted', cancelled: 'Cancelled', unknown: 'Unknown' })[status];
}
export function importStatusColor(status: ImportStatus) {
  return status === 'completed' ? 'success' : ['failed', 'aborted', 'cancelled'].includes(status) ? 'error' : status === 'unknown' ? 'warning' : 'primary';
}
export function importServiceKey(type: MediaType, config: MediaServiceConfig) {
  return CryptoJS.SHA256(JSON.stringify([type, config.base_url, config.api_key])).toString();
}
export function findRunningImport(type: MediaType, config: MediaServiceConfig, downloadId: string) {
  const service = importServiceKey(type, config);
  const download = CryptoJS.SHA256(downloadId).toString();
  return trackedImports.value.find(item => item.service === service && item.download === download && (importInProgress(item.status) || item.status === 'unknown' || !!item.error));
}
export function latestTrackedImport(type: MediaType, config: MediaServiceConfig, downloadId: unknown) {
  if (typeof downloadId !== 'string' || !downloadId) return;
  const service = importServiceKey(type, config);
  const download = CryptoJS.SHA256(downloadId).toString();
  return trackedImports.value.slice().reverse().find(item => item.service === service && item.download === download);
}
function persist() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(trackedImports.value)); } catch { /* Tracking remains available in memory if browser storage is blocked. */ }
}
export function normalizeImportStatus(value: unknown, result?: unknown): ImportStatus {
  if (value === 'completed' && result === 'unsuccessful') return 'failed';
  return typeof value === 'string' && statuses.includes(value) ? value as ImportStatus : 'unknown';
}
export function rememberImport(type: MediaType, config: MediaServiceConfig, downloadId: string, title: string, command: { id: number; status?: unknown; result?: unknown }) {
  const service = importServiceKey(type, config);
  const entry: TrackedImport = { key: `${service}:${command.id}`, service, download: CryptoJS.SHA256(downloadId).toString(),
    type, title, commandId: command.id, status: normalizeImportStatus(command.status ?? 'queued', command.result), createdAt: Date.now(), error: '' };
  trackedImports.value = [...trackedImports.value.filter(item => item.key !== entry.key), entry];
  persist();
  return entry;
}
export function dismissImport(key: string) {
  trackedImports.value = trackedImports.value.filter(item => item.key !== key || importInProgress(item.status));
  persist();
}
const inFlight = new Map<string, Promise<TrackedImport | undefined>>();
export function checkTrackedImport(key: string, config: MediaServiceConfig): Promise<TrackedImport | undefined> {
  const running = inFlight.get(key);
  if (running) return running;
  const entry = trackedImports.value.find(item => item.key === key);
  if (!entry || entry.service !== importServiceKey(entry.type, config)) return Promise.resolve(undefined);
  const task = (async () => {
    let updated = { ...entry };
    try {
      const response = await fetch(`${config.base_url}/api/v3/command/${entry.commandId}`, {
        headers: { 'X-Api-Key': config.api_key }, signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
      });
      const command = requireObject(await readApiJson(response), 'import command');
      if (command.id !== entry.commandId || typeof command.status !== 'string') throw new Error('Invalid command status.');
      updated = { ...entry, status: normalizeImportStatus(command.status, command.result), error: '' };
    } catch { updated.error = 'Unable to check the import status. The command may still be running.'; }
    const index = trackedImports.value.findIndex(item => item.key === key && item.createdAt === entry.createdAt);
    if (index === -1) return;
    trackedImports.value[index] = updated;
    persist();
    return updated;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}
