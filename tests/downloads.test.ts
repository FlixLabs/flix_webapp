import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useDownloadActions } from '@/composables/useDownloadActions';
import type { MediaInstance } from '@/composables/useMediaService';

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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    await actions.removeDownload(type, { id: -42, title: 'Download' });
    const service = type === 'movies' ? 'radarr' : 'sonarr';
    expect(fetchMock).toHaveBeenCalledWith(
      `http://${service}.test/api/v3/queue/-42?removeFromClient=true&blocklist=false&skipRedownload=true`,
      { method: 'DELETE', headers: { 'X-Api-Key': type === 'movies' ? 'movie-key' : 'series-key' } },
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
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await useDownloadActions(options).removeDownload('movies', { id: 42, title: 'Download' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('http://direct.test/api/v3/queue/42?');
    expect(fetchMock.mock.calls[0]?.[1].headers).toEqual({ 'X-Api-Key': 'direct-key' });
  });

  it.each(['http', 'network'])('reports %s failures without refreshing or reporting success', async failure => {
    const options = createOptions();
    const fetchMock = failure === 'http'
      ? vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
      : vi.fn().mockRejectedValue(new Error('Offline'));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    await actions.removeDownload('series', { id: 42, title: 'Download' });
    expect(options.showErrorAlert).toHaveBeenCalledOnce();
    expect(options.showSuccessAlert).not.toHaveBeenCalled();
    expect(options.refreshDownloads).not.toHaveBeenCalled();
    expect(actions.isRemoving.value).toBe(false);
  });

  it('prevents simultaneous duplicate removals', async () => {
    const options = createOptions();
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useDownloadActions(options);
    const first = actions.removeDownload('movies', { id: 42, title: 'Download' });
    expect(actions.isRemoving.value).toBe(true);
    await actions.removeDownload('movies', { id: 42, title: 'Download' });
    expect(fetchMock).toHaveBeenCalledOnce();
    resolve(new Response(null, { status: 204 }));
    await first;
    expect(actions.isRemoving.value).toBe(false);
  });
});
