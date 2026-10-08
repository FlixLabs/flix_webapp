import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useReleaseSearch, type Release } from '@/composables/useReleaseSearch';
import type { MediaInstance } from '@/composables/useMediaService';

const candidate: Release = { guid: 'release-guid', indexerId: 7, title: 'Selected release', downloadAllowed: true };
const episodeData = [
  { id: 11, seasonNumber: 0, episodeNumber: 1, title: 'Special' },
  { id: 21, seasonNumber: 1, episodeNumber: 1, title: 'Pilot' },
  { id: 22, seasonNumber: 1, episodeNumber: 2, title: 'Second' },
  { id: 31, seasonNumber: 2, episodeNumber: 1, title: 'Next season' },
];
function createOptions() {
  return {
    useAPI: ref(true),
    selectedInstanceData: ref<MediaInstance | null>({
      name: 'Test',
      radarr: { base_url: 'http://radarr.test', api_key: 'movie-key', root_folder_path: '/movies' },
      sonarr: { base_url: 'http://sonarr.test', api_key: 'series-key', root_folder_path: '/tv' },
    }),
  };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('interactive release search', () => {
  it('searches a movie without launching a command or download', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([candidate]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://radarr.test/api/v3/release?movieId=42');
    expect(fetchMock.mock.calls[0]?.[1].method).toBeUndefined();
    expect(actions.releases.value).toEqual([candidate]);
    expect(actions.hasSearched.value).toBe(true);
  });

  it('downloads exactly the chosen indexer and GUID, including duplicate GUIDs across indexers', async () => {
    const second = { ...candidate, indexerId: 9 };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([candidate, second])).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(await actions.grab(second)).toBe(true);
    const [url, request] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://radarr.test/api/v3/release');
    expect(request.method).toBe('POST');
    expect(request.headers['X-Api-Key']).toBe('movie-key');
    expect(JSON.parse(request.body)).toEqual({ guid: 'release-guid', indexerId: 9, movieId: 42 });
  });

  it.each([{ title: 'No ID' }, { id: 42, title: 'Not added', already_in_library: false }])('rejects media absent from the library', async item => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', item);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(actions.error.value).toContain('already present');
  });

  it('loads series episodes, then searches seasons and individual episodes with the correct IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(episodeData)).mockImplementation(() => Promise.resolve(Response.json([candidate])));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('series', { id: 42, title: 'Series' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://sonarr.test/api/v3/episode?seriesId=42');
    expect(actions.season.value).toBe(1);
    expect(actions.seasons.value).toEqual([0, 1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(actions.releases.value).toEqual([candidate]);
    expect(actions.hasSearched.value).toBe(true);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://sonarr.test/api/v3/release?seriesId=42&seasonNumber=1');
    actions.episodeId.value = 22;
    expect(actions.releases.value).toEqual([]);
    await vi.waitFor(() => expect(actions.releases.value).toEqual([candidate]));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://sonarr.test/api/v3/release?episodeId=22');
    expect(await actions.grab(candidate)).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1].body)).toEqual({ guid: 'release-guid', indexerId: 7, seriesId: 42, episodeId: 22 });
    actions.season.value = 2;
    expect(actions.episodeId.value).toBeNull();
    expect(actions.releases.value).toEqual([]);
    expect(fetchMock.mock.calls[4]?.[0]).toBe('http://sonarr.test/api/v3/release?seriesId=42&seasonNumber=2');
    await vi.waitFor(() => expect(actions.releases.value).toEqual([candidate]));
  });

  it('cancels the previous season search and ignores its late results', async () => {
    let resolvePrevious!: (response: Response) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json(episodeData))
      .mockResolvedValueOnce(Response.json([candidate]))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { resolvePrevious = resolve; }))
      .mockResolvedValueOnce(Response.json([{ ...candidate, guid: 'new-season' }]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('series', { id: 42, title: 'Series' });
    actions.season.value = 2;
    const previousSignal = fetchMock.mock.calls[2]?.[1].signal;
    actions.season.value = 0;
    expect(previousSignal.aborted).toBe(true);
    expect(fetchMock.mock.calls[3]?.[0]).toContain('seasonNumber=0');
    await vi.waitFor(() => expect(actions.releases.value[0]?.guid).toBe('new-season'));
    resolvePrevious(Response.json([candidate]));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(actions.releases.value[0]?.guid).toBe('new-season');
  });

  it('supports special season zero', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(episodeData.filter(episode => episode.seasonNumber === 0))).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('series', { id: 42, title: 'Series' });
    expect(actions.season.value).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('seasonNumber=0');
  });

  it('does not fall back to RSS when no season or episode is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('series', { id: 42, title: 'Series' });
    await actions.search();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(actions.error.value).toContain('select a season');
  });

  it('allows an explicitly chosen rejected release when the service permits downloading it', async () => {
    const rejected = { ...candidate, rejected: true, rejections: ['Quality below cutoff'] };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([rejected])).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(await actions.grab(rejected)).toBe(true);
  });

  it('prevents downloading unavailable or stale releases', async () => {
    const forbidden = { ...candidate, downloadAllowed: false };
    const fetchMock = vi.fn().mockResolvedValue(Response.json([forbidden]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(await actions.grab(forbidden)).toBe(false);
    expect(await actions.grab({ ...candidate, guid: 'old-result' })).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports expired release caches without falsely reporting a download', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([candidate])).mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(await actions.grab(candidate)).toBe(false);
    expect(actions.error.value).toContain('Search again');
    expect(actions.isGrabbing.value).toBe(false);
  });

  it('prevents duplicate download requests while one is pending', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([candidate])).mockImplementationOnce(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    const pending = actions.grab(candidate);
    expect(await actions.grab(candidate)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolve(new Response(null, { status: 204 }));
    expect(await pending).toBe(true);
  });

  it('aborts a search and discards late responses after closing', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(r => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    const pending = actions.open('movies', { id: 42, title: 'Movie' });
    actions.close();
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true);
    resolve(Response.json([candidate])); await pending;
    expect(actions.releases.value).toEqual([]);
    expect(actions.dialog.value).toBe(false);
  });

  it('clears selection on instance change and never downloads on the new instance', async () => {
    const options = createOptions();
    const fetchMock = vi.fn().mockResolvedValue(Response.json([candidate]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(options);
    await actions.open('movies', { id: 42, title: 'Movie' });
    options.selectedInstanceData.value = { ...options.selectedInstanceData.value!, name: 'Second' };
    expect(await actions.grab(candidate)).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(actions.dialog.value).toBe(false);
  });

  it('reports HTTP and network search failures and allows retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 500 })).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(createOptions());
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(actions.error.value).toContain('Unable to search');
    await actions.search(); expect(actions.error.value).toContain('Unable to search');
    await actions.search(); expect(actions.error.value).toBe('');
    expect(actions.hasSearched.value).toBe(true);
    expect(actions.isSearching.value).toBe(false);
  });

  it('works without the Flix API', async () => {
    const options = createOptions(); options.useAPI.value = false; options.selectedInstanceData.value = null;
    vi.stubEnv('VITE_RADARR_BASE_URL', 'http://direct.test'); vi.stubEnv('VITE_RADARR_API_KEY', 'direct-key');
    const fetchMock = vi.fn().mockResolvedValue(Response.json([])); vi.stubGlobal('fetch', fetchMock);
    const actions = useReleaseSearch(options);
    await actions.open('movies', { id: 42, title: 'Movie' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://direct.test/api/v3/release?movieId=42');
    expect(fetchMock.mock.calls[0]?.[1].headers['X-Api-Key']).toBe('direct-key');
  });

  it('cleans up requests when the component scope is disposed', () => {
    const scope = effectScope();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetchMock);
    const actions = scope.run(() => useReleaseSearch(createOptions()))!;
    void actions.open('movies', { id: 42, title: 'Movie' });
    scope.stop();
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true);
  });
});
