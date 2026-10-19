import { afterEach, expect, it, vi } from 'vitest';
import { trackedImports, rememberImport, findRunningImport, checkTrackedImport, importServiceKey, normalizeImportStatus, dismissImport } from '@/composables/manualImportTracking';
const config = { base_url: 'http://radarr.test', api_key: 'private-api-key', root_folder_path: '/movies' };
function start() { return rememberImport('movies', config, 'download-id', 'A movie', { id: 99, status: 'queued' }); }
afterEach(() => { trackedImports.value = []; vi.unstubAllGlobals(); });
it('persists accepted commands without credentials, download identifiers or file paths', () => {
  const setItem = vi.fn();
  vi.stubGlobal('sessionStorage', { setItem });
  const entry = start();
  expect(findRunningImport('movies', config, 'download-id')?.commandId).toBe(99);
  expect(findRunningImport('series', config, 'download-id')).toBeUndefined();
  expect(findRunningImport('movies', { ...config, api_key: 'another-key' }, 'download-id')).toBeUndefined();
  const saved = String(setItem.mock.calls[0]![1]);
  for (const secret of [config.api_key, config.base_url, config.root_folder_path, 'download-id']) expect(saved).not.toContain(secret);
  expect(JSON.parse(saved)[0]).toEqual(entry);
});
it('checks status with GET only and deduplicates concurrent checks', async () => {
  const entry = start();
  const fetch = vi.fn().mockResolvedValue(Response.json({ id: 99, status: 'started' }));
  vi.stubGlobal('fetch', fetch);
  const first = checkTrackedImport(entry.key, config);
  const second = checkTrackedImport(entry.key, config);
  expect(first).toBe(second);
  await first;
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0]![0]).toBe('http://radarr.test/api/v3/command/99');
  expect(fetch.mock.calls[0]![1].method).toBeUndefined();
  expect(trackedImports.value[0]!.status).toBe('started');
  expect(await checkTrackedImport(entry.key, { ...config, base_url: 'http://other.test' })).toBeUndefined();
  expect(fetch).toHaveBeenCalledOnce();
});
it('keeps last known status on failure and recovers without replaying the import', async () => {
  const entry = start();
  const fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ id: 99, status: 'completed' }));
  vi.stubGlobal('fetch', fetch);
  await checkTrackedImport(entry.key, config);
  expect(trackedImports.value[0]).toMatchObject({ status: 'queued', error: expect.stringContaining('may still be running') });
  await checkTrackedImport(entry.key, config);
  expect(trackedImports.value[0]).toMatchObject({ status: 'completed', error: '' });
  expect(findRunningImport('movies', config, 'download-id')).toBeUndefined();
});
it('does not treat a different command or an unsuccessful result as success', async () => {
  const entry = start();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ id: 100, status: 'completed' })).mockResolvedValueOnce(Response.json({ id: 99, status: 'completed', result: 'unsuccessful' })));
  await checkTrackedImport(entry.key, config);
  expect(trackedImports.value[0]!.status).toBe('queued');
  await checkTrackedImport(entry.key, config);
  expect(trackedImports.value[0]!.status).toBe('failed');
  expect(normalizeImportStatus('unexpected')).toBe('unknown');
});
it('dismisses only finished records without touching the service', () => {
  const entry = start();
  dismissImport(entry.key);
  expect(trackedImports.value).toHaveLength(1);
  trackedImports.value[0]!.status = 'completed';
  dismissImport(entry.key);
  expect(trackedImports.value).toEqual([]);
  expect(importServiceKey('movies', config)).not.toBe(importServiceKey('series', config));
});
