import { afterEach, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { downloadSourceUrl, downloadSourceIndexer, useDownloadSourceLinks } from '@/composables/useDownloadSourceLinks';
import type { MediaInstance } from '@/composables/useMediaService';

const source = 'https://indexer.test/details/42';
const grabbed = { downloadId: 'abc', eventType: 'grabbed', data: { nzbInfoUrl: source } };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup() {
  const options = { useAPI: ref(true), selectedInstanceData: ref<MediaInstance | null>({ name: 'Test',
    radarr: { base_url: 'http://radarr.test', api_key: 'movie-key', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'series-key', root_folder_path: '/tv' },
  }) };
  const fetchMock = vi.fn(async () => Response.json({ records: [grabbed] }));
  vi.stubGlobal('fetch', fetchMock);
  const scope = effectScope();
  scopes.push(scope);
  return { links: scope.run(() => useDownloadSourceLinks(options))!, options, fetchMock, scope };
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('accepts only safe details URLs, never download URLs or GUIDs', () => {
  expect(downloadSourceUrl(grabbed)).toBe(source);
  expect(downloadSourceUrl({ data: { NzbInfoUrl: source } })).toBe(source);
  for (const infoUrl of ['javascript:alert(1)', 'https://user:secret@indexer.test', '/relative', 'https://indexer.test/\nfoo']) {
    expect(downloadSourceUrl({ infoUrl })).toBeUndefined();
  }
  expect(downloadSourceUrl({ data: { downloadUrl: source, guid: source } })).toBeUndefined();
});

it('reads an explicit indexer name without guessing from titles or download URLs', () => {
  expect(downloadSourceIndexer({ indexer: ' Ygg ', data: { indexer: 'Other' } })).toBe('Ygg');
  expect(downloadSourceIndexer({ data: { Indexer: ' Torrent9 ' } })).toBe('Torrent9');
  for (const indexer of [null, 42, {}, [], '   ']) expect(downloadSourceIndexer({ indexer })).toBeUndefined();
  expect(downloadSourceIndexer({ data: { downloadUrl: source, title: 'Ygg release' } })).toBeUndefined();
});

it('resolves the indexer and URL together using a single cached exact-ID lookup', async () => {
  const { links, fetchMock } = setup();
  fetchMock.mockResolvedValueOnce(Response.json({ records: [
    { ...grabbed, downloadId: 'other', data: { indexer: 'Wrong' } },
    { ...grabbed, data: { indexer: 'Ygg', nzbInfoUrl: source } },
  ] }));
  expect(await links.resolveInfo('movies', { downloadId: 'abc' })).toEqual({ indexer: 'Ygg', url: source });
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBe(source);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('retains a verified indexer even when the source URL is missing or unsafe', async () => {
  const { links, fetchMock } = setup();
  fetchMock.mockResolvedValueOnce(Response.json({ records: [{ ...grabbed, data: { indexer: 'Ygg', nzbInfoUrl: 'javascript:alert(1)' } }] }));
  expect(await links.resolveInfo('movies', { downloadId: 'abc' })).toEqual({ indexer: 'Ygg', url: undefined });
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBeUndefined();
});

it('looks up the exact grab by download ID for either service and deduplicates requests', async () => {
  const { links, fetchMock } = setup();
  expect(await Promise.all([links.resolve('movies', { downloadId: 'abc' }), links.resolve('movies', { downloadId: 'abc' })])).toEqual([source, source]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(new URL(url).searchParams.get('downloadId')).toBe('abc');
  expect(new URL(url).searchParams.get('eventType')).toBe('1');
  expect(init.headers).toEqual({ 'X-Api-Key': 'movie-key' });
  expect(await links.resolve('series', { downloadId: 'abc' })).toBe(source);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('ignores unrelated or unsafe history entries even if their title matches', async () => {
  const { links, fetchMock } = setup();
  fetchMock.mockResolvedValueOnce(Response.json({ records: [
    { ...grabbed, downloadId: 'other' }, { ...grabbed, eventType: 'downloadFailed' },
    { ...grabbed, data: { nzbInfoUrl: 'javascript:alert(1)' } },
  ] }));
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBeUndefined();
});

it('skips lookups when a direct source exists or the download ID is missing', async () => {
  const { links, fetchMock } = setup();
  expect(await links.resolve('movies', { infoUrl: source })).toBe(source);
  expect(await links.resolve('series', {})).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps failures non-blocking and isolates cached sources between instances', async () => {
  const { links, fetchMock, options } = setup();
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBe(source);
  options.selectedInstanceData.value!.radarr.base_url = 'http://other.test';
  fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }));
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBeUndefined();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('aborts pending reads on context changes and disposal without publishing stale links', async () => {
  const { links, fetchMock, options, scope } = setup();
  let finish!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = links.resolve('movies', { downloadId: 'abc' });
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  options.selectedInstanceData.value = null;
  expect(init.signal!.aborted).toBe(true);
  finish(Response.json({ records: [grabbed] }));
  expect(await pending).toBeUndefined();
  scope.stop();
});

it('supports standalone mode without Flix API', async () => {
  const { links, options, fetchMock } = setup();
  vi.stubEnv('VITE_RADARR_BASE_URL', 'http://standalone.test');
  vi.stubEnv('VITE_RADARR_API_KEY', 'standalone-key');
  options.useAPI.value = false;
  expect(await links.resolve('movies', { downloadId: 'abc' })).toBe(source);
  expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('http://standalone.test/api/v3/history?');
});
