import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { downloadableCollectionMovies, useCollectionDownloads, type CollectionDownloadMovie } from '@/composables/useCollectionDownloads';

const missing: CollectionDownloadMovie = { tmdbId: 10, title: 'Missing film', status: 'released', state: 'Missing' };
const config = { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup() {
  const selectedInstanceData = ref({ name: 'Test', radarr: config, sonarr: config });
  const scope = effectScope(); scopes.push(scope);
  return { selectedInstanceData, actions: scope.run(() => useCollectionDownloads({ useAPI: ref(true), selectedInstanceData }))! };
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });

describe('collection download requests', () => {
  it('includes known upcoming films but excludes available, unknown and invalid movies', () => {
    const future = { ...missing, tmdbId: 11, state: 'Upcoming', status: 'announced' };
    expect(downloadableCollectionMovies([missing, future, { ...missing, state: 'Available' }, { ...missing, status: 'announced' },
      { ...missing, state: 'Unknown' }, { ...missing, tmdbId: 0 }])).toEqual([missing, future]);
  });
  it.each(['announced', 'inCinemas'])('adds a %s film monitored without an immediate search', async status => {
    const future = { ...missing, state: 'Upcoming', status };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json(future)).mockResolvedValueOnce(Response.json({ id: 7 }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([future], 3);
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toMatchObject({ monitored: true, minimumAvailability: 'released', qualityProfileId: 3, addOptions: { searchForMovie: false } });
    expect(actions.results.value[0]).toMatchObject({ state: 'requested', message: expect.stringContaining('No immediate search') });
  });
  it('does not add or search an upcoming movie that is already monitored', async () => {
    const future = { ...missing, state: 'Upcoming', status: 'announced' };
    const fetch = vi.fn().mockResolvedValue(Response.json([{ ...future, id: 7, hasFile: false, monitored: true }]));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([future], null);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(actions.results.value[0]!.state).toBe('requested');
  });
  it('enables monitoring on an existing upcoming movie without changing its other settings', async () => {
    const future = { ...missing, state: 'Upcoming', status: 'announced' };
    const local = { ...future, id: 7, hasFile: false, monitored: false, qualityProfileId: 9, minimumAvailability: 'released', tags: [2] };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([local])).mockResolvedValueOnce(Response.json(local))
      .mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json({ ...local, monitored: true }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([future], null);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls[2]![1].method).toBe('PUT');
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toMatchObject({ id: 7, monitored: true, qualityProfileId: 9, minimumAvailability: 'released', tags: [2] });
    expect(fetch.mock.calls.some(call => String(call[0]).includes('/command'))).toBe(false);
    expect(actions.results.value[0]!.state).toBe('requested');
  });
  it('searches an existing missing film instead of adding it again', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([{ id: 7, ...missing, hasFile: false }])).mockResolvedValueOnce(Response.json({}));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([missing, missing], null);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ name: 'MoviesSearch', movieIds: [7] });
    expect(actions.results.value[0]!.state).toBe('requested');
  });
  it('adds a new released film with the selected profile and automatic search', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json(missing)).mockResolvedValueOnce(Response.json({ id: 7 }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([missing], 3);
    expect(JSON.parse(fetch.mock.calls[2]![1].body)).toMatchObject({ tmdbId: 10, qualityProfileId: 3, rootFolderPath: '/movies', addOptions: { searchForMovie: true } });
    expect(actions.results.value[0]!.state).toBe('requested');
  });
  it.each([true, undefined])('does not search when a file is available or unknown (%s)', async hasFile => {
    const fetch = vi.fn().mockResolvedValue(Response.json([{ id: 7, ...missing, hasFile }]));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([missing], 1);
    expect(fetch).toHaveBeenCalledTimes(1); expect(actions.results.value[0]!.state).toBe('skipped');
  });
  it('does not add a film without a valid profile or matching lookup', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json({ ...missing, tmdbId: 20 }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([missing], null); await actions.run([missing], 1);
    expect(fetch.mock.calls.every(call => !call[1]?.method)).toBe(true);
    expect(actions.results.value[0]!.state).toBe('failed');
  });
  it('never retries an uncertain write automatically', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json([{ id: 7, ...missing, hasFile: false }])).mockRejectedValueOnce(new TypeError('Offline'));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup(); await actions.run([missing], null);
    expect(fetch).toHaveBeenCalledTimes(2); expect(actions.results.value[0]!.state).toBe('failed');
    expect(actions.pending.value).toBe(false);
  });
  it('stops before writing when the instance changes during verification', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { actions, selectedInstanceData } = setup(); const running = actions.run([missing], 1);
    selectedInstanceData.value = { name: 'Second', radarr: { ...config, base_url: 'http://second.test' }, sonarr: config };
    finish(Response.json([{ id: 7, ...missing, hasFile: false }])); await running;
    expect(fetch).toHaveBeenCalledTimes(1); expect(actions.results.value).toEqual([]);
  });
  it('stops before adding when the root folder changes during verification', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { actions, selectedInstanceData } = setup(); const running = actions.run([missing], 1);
    selectedInstanceData.value = { name: 'Test', radarr: { ...config, root_folder_path: '/different' }, sonarr: config };
    finish(Response.json([])); await running;
    expect(fetch).toHaveBeenCalledTimes(1); expect(actions.results.value).toEqual([]);
  });
});
