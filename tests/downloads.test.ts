import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useDownloadActions } from '@/composables/useDownloadActions';
import type { MediaInstance } from '@/composables/useMediaService';
import { commandImportBlock, queueImportBlock } from '@/composables/queueImportProtection';

const download = { id: 42, title: 'Download', downloadId: 'download-id' };
function safeRemote(id = 42) {
  return async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json(new URL(url).pathname.endsWith('/command') ? [] : {
      totalRecords: 1, records: [{ id, downloadId: download.downloadId, trackedDownloadState: 'downloading' }],
    });
  };
}

function createOptions() {
  return {
    useAPI: ref(true),
    selectedInstanceData: ref<MediaInstance | null>({
      name: 'Test',
      radarr: { base_url: 'http://radarr.test', api_key: 'movie-key', root_folder_path: '/movies' },
      sonarr: { base_url: 'http://sonarr.test', api_key: 'series-key', root_folder_path: '/tv' },
    }),
    showSuccessAlert: vi.fn(),
    showErrorAlert: vi.fn(),
    refreshDownloads: vi.fn(),
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('download removal', () => {
  it.each(['movies', 'series'] as const)('removes %s using the queue ID and accepts an empty 204 response', async type => {
    const options = createOptions();
    const fetchMock = vi.fn(safeRemote(-42));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    await actions.removeDownload(type, { ...download, id: -42 });
    const service = type === 'movies' ? 'radarr' : 'sonarr';
    expect(fetchMock).toHaveBeenCalledWith(
      `http://${service}.test/api/v3/queue/-42?removeFromClient=true&blocklist=false&skipRedownload=true`,
      expect.objectContaining({ method: 'DELETE', headers: { 'X-Api-Key': type === 'movies' ? 'movie-key' : 'series-key' } }),
    );
    expect(options.refreshDownloads).toHaveBeenCalledWith(type);
    expect(options.showSuccessAlert).toHaveBeenCalledOnce();
    expect(actions.isRemoving.value).toBe(false);
  });

  it.each([undefined, NaN, 1.5])('rejects invalid queue ID %s without a request', async id => {
    const options = createOptions();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', { id, title: 'Download' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.showErrorAlert).toHaveBeenCalledOnce();
  });

  it('does not send a request while the instance is unavailable', async () => {
    const options = createOptions();
    options.selectedInstanceData.value = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', { id: 42, title: 'Download' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(options.showErrorAlert).toHaveBeenCalledOnce();
  });

  it('uses standalone configuration without requiring the Flix API', async () => {
    const options = createOptions();
    options.useAPI.value = false;
    options.selectedInstanceData.value = null;
    vi.stubEnv('VITE_RADARR_BASE_URL', 'http://direct.test');
    vi.stubEnv('VITE_RADARR_API_KEY', 'direct-key');
    vi.stubEnv('VITE_SONARR_BASE_URL', 'http://series.test');
    vi.stubEnv('VITE_SONARR_API_KEY', 'series-key');
    const fetchMock = vi.fn(safeRemote());
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', download);
    expect(fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')?.[0]).toContain('http://direct.test/api/v3/queue/42?');
    expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({ 'X-Api-Key': 'direct-key' });
  });

  it.each(['http', 'network'])('reports %s failures without refreshing or reporting success', async failure => {
    const options = createOptions();
    const fetchMock = failure === 'http'
      ? vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
      : vi.fn().mockRejectedValue(new Error('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    await actions.removeDownload('series', download);
    expect(options.showErrorAlert).toHaveBeenCalledOnce();
    expect(options.showSuccessAlert).not.toHaveBeenCalled();
    expect(options.refreshDownloads).not.toHaveBeenCalled();
    expect(actions.isRemoving.value).toBe(false);
  });

  it('prevents simultaneous duplicate removals', async () => {
    const options = createOptions();
    let resolve!: (response: Response) => void;
    const remote = safeRemote();
    const fetchMock = vi.fn((url: string, init?: RequestInit) => init?.method === 'DELETE'
      ? new Promise<Response>(r => { resolve = r; }) : remote(url, init));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    const first = actions.removeDownload('movies', download);
    expect(actions.isRemoving.value).toBe(true);
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    await actions.removeDownload('movies', download);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
    resolve(new Response(null, { status: 204 }));
    await first;
    expect(actions.isRemoving.value).toBe(false);
  });

  it.each(['importing', 'importPending', 'unknown', undefined])('blocks current queue state %s before any DELETE', async state => {
    const options = createOptions();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ totalRecords: 1, records: [{ ...download, trackedDownloadState: state }] }));
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', download);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    expect(options.showErrorAlert).toHaveBeenCalledOnce();
    expect(options.showSuccessAlert).not.toHaveBeenCalled();
  });

  it('checks both services for a queued manual import even if the queue still says downloading', async () => {
    const options = createOptions();
    const remote = safeRemote();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => url.includes('sonarr.test/api/v3/command')
      ? Response.json([{ name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: download.downloadId }] } }]) : remote(url, init));
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', download);
    expect(options.showErrorAlert).toHaveBeenCalledWith('Import queued. Removal is blocked, including forced removal.');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('rejects disappeared or changed queue identities instead of deleting a different download', async () => {
    for (const records of [[], [{ ...download, downloadId: 'other', trackedDownloadState: 'downloading' }]]) {
      const options = createOptions();
      const remote = safeRemote();
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => url.includes('/queue?')
        ? Response.json({ totalRecords: records.length, records }) : remote(url, init));
      vi.stubGlobal('fetch', fetchMock);
      await useDownloadActions(options).removeDownload('movies', download);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    }
  });

  it('never deletes on a new instance when configuration changes during verification', async () => {
    const options = createOptions();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = useDownloadActions(options).removeDownload('movies', download);
    options.selectedInstanceData.value = null;
    finish(Response.json({ totalRecords: 0, records: [] }));
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(options.showSuccessAlert).not.toHaveBeenCalled();
  });

  it('blocks unverifiable command scopes and preserves finished or unrelated commands', () => {
    expect(queueImportBlock(null)).toBe('Import status unavailable');
    expect(commandImportBlock([{ name: 'ManualImport', status: 'started', body: { files: [{ path: '/remote/file.mkv' }] } }], 'id')).toBe('Import status unavailable');
    expect(commandImportBlock([{ name: 'ManualImport', status: 'orphaned' }], 'id')).toBe('Import status unavailable');
    for (const name of ['DownloadedMoviesScan', 'DownloadedEpisodesScan']) {
      expect(commandImportBlock([{ name, status: 'started', body: { downloadClientId: 'ID' } }], 'id')).toBe('Import in progress');
      expect(commandImportBlock([{ name, status: 'started', body: { downloadClientId: 'other' } }], 'id')).toBeNull();
    }
    expect(commandImportBlock([{ name: 'ManualImport', status: 'completed' }], 'id')).toBeNull();
    expect(() => commandImportBlock({}, 'id')).toThrow();
  });
});
