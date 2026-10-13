import { afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, ref, toRaw } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useLibraryChecker } from '@/composables/useLibraryChecker';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function setup(data: unknown, status = 200, apiMode = true, type: 'movies' | 'series' = 'movies') {
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => data }));
  setActivePinia(createPinia());
  const config = { base_url: 'http://service.test', api_key: 'test', root_folder_path: '/media' };
  useFlixStore().setInstances([{ name: 'Test', radarr: config, sonarr: config }]);
  const items = ref<Record<string, unknown>[]>([{ tmdbId: 10, title: 'Example', release_date: '2026-10-09' }]);
  const error = vi.fn();
  return { items, error, ...useLibraryChecker(type, items, error, ref(apiMode)) };
}

it.each([null, undefined, {}, { error: 'Service unavailable' }, [null]])(
  'handles non-iterable library responses: %j', async data => {
    const state = setup(data);
    await state.isAlreadyInLibrary();
    expect(state.error).toHaveBeenCalledWith(expect.stringMatching(/^Invalid (library|service) response\. Please try again\.$/));
    expect(state.items.value[0]).not.toHaveProperty('year');
  },
);

it('handles library HTTP errors explicitly', async () => {
  const state = setup({}, 500);
  await state.isAlreadyInLibrary();
  expect(state.error).toHaveBeenCalledWith('Unable to load data (HTTP 500).');
});

it('shares overlapping checks but makes a fresh read after they finish', async () => {
  const state = setup([{ id: 1, tmdbId: 10 }]);
  await Promise.all([state.isAlreadyInLibrary(), state.isAlreadyInLibrary()]);
  expect(fetch).toHaveBeenCalledTimes(1);
  await state.isAlreadyInLibrary();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not request libraries for empty search results', async () => {
  const state = setup([]);
  state.items.value = [];
  await state.isAlreadyInLibrary();
  expect(fetch).not.toHaveBeenCalled();
});

it('ignores an old response after replacing search results', async () => {
  const state = setup([]);
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const check = state.isAlreadyInLibrary();
  await Promise.resolve();
  state.items.value = [{ tmdbId: 10, title: 'New search', release_date: '' }];
  resolve(new Response(JSON.stringify([{ id: 7, tmdbId: 10 }])));
  await check;
  expect(state.items.value[0]).not.toHaveProperty('id');
  expect(state.error).not.toHaveBeenCalled();
});

it.each(['instance', 'dispose'])('ignores pending checks after %s changes', async reason => {
  const scope = effectScope();
  const state = scope.run(() => setup([]))!;
  let resolve!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  const check = state.isAlreadyInLibrary();
  await Promise.resolve();
  if (reason === 'dispose') scope.stop();
  else {
    const store = useFlixStore();
    // Even leaving and returning to the same instance invalidates old checks.
    store.selectedInstance = null;
    store.selectedInstance = 'Test';
  }
  resolve(new Response(JSON.stringify([{ id: 7, tmdbId: 10 }])));
  await check;
  expect(state.items.value[0]).not.toHaveProperty('id');
  expect(state.error).not.toHaveBeenCalled();
  scope.stop();
});

it('never matches missing or zero external IDs', async () => {
  const state = setup([{ id: 7 }, { id: 8, tmdbId: 0 }]);
  state.items.value = [{ tmdbId: 0, title: 'Unknown', release_date: '' }];
  await state.isAlreadyInLibrary();
  expect(state.items.value[0]).not.toHaveProperty('id');
});

it('keeps standalone library checks independent from Flix API', async () => {
  vi.stubEnv('VITE_RADARR_BASE_URL', 'http://standalone.test');
  vi.stubEnv('VITE_RADARR_API_KEY', 'standalone-only');
  const state = setup([{ id: 7, tmdbId: 10 }], 200, false);
  await state.isAlreadyInLibrary();
  expect(fetch).toHaveBeenCalledWith('http://standalone.test/api/v3/movie?apikey=standalone-only', expect.any(Object));
  expect(state.items.value[0]).toMatchObject({ id: 7, already_in_library: true });
});

it('enriches valid library entries without replacing their upcoming date', async () => {
  const state = setup([{ id: 1, tmdbId: 10, year: 2025 }]);
  await state.isAlreadyInLibrary();
  expect(state.error).not.toHaveBeenCalled();
  expect(state.items.value[0]).toMatchObject({ year: 2025, release_date: '2026-10-09', already_in_library: true });
});

it('keeps scanned file details when enriching dashboard and outings results', async () => {
  const state = setup([{ id: 1, tmdbId: 10, movieFile: {
    relativePath: 'Movie.mkv', size: 4e9, quality: {},
    mediaInfo: { resolution: '1920x1080', videoCodec: 'x264' },
  } }]);
  await state.isAlreadyInLibrary();
  expect(state.error).not.toHaveBeenCalled();
  expect(state.items.value[0]).toMatchObject({ sizeOnDisk: 4e9, fileDetails: { resolution: '1920x1080', videoCodec: 'x264' } });
});

it('clears obsolete membership and file fields after a successful retry', async () => {
  const state = setup([{ id: 1, tmdbId: 10, hasFile: true, movieFile: { relativePath: 'Old.mkv', size: 4e9 }, statistics: { sizeOnDisk: 4e9 } }]);
  await state.isAlreadyInLibrary();
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as unknown as Response);
  await state.isAlreadyInLibrary();
  expect(state.items.value[0]).toMatchObject({ already_in_library: false, hasFile: false });
  for (const field of ['id', 'relativePath', 'fileDetails', 'statistics']) expect(state.items.value[0]).not.toHaveProperty(field);
  expect(state.readState).toMatchObject({ error: '', hasData: true });
});

it('clears old file metadata when the media exists but no longer has a file', async () => {
  const state = setup([{ id: 1, tmdbId: 10, hasFile: true, movieFile: { relativePath: 'Old.mkv', size: 4e9 } }]);
  await state.isAlreadyInLibrary();
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [{ id: 1, tmdbId: 10, hasFile: false }] } as unknown as Response);
  await state.isAlreadyInLibrary();
  expect(state.items.value[0]).toMatchObject({ id: 1, already_in_library: true, hasFile: false });
  expect(state.items.value[0]).not.toHaveProperty('relativePath');
});

it('does not invalidate data for an identical instance configuration reload', async () => {
  const state = setup([{ id: 1, tmdbId: 10 }]);
  await state.isAlreadyInLibrary();
  const store = useFlixStore();
  store.setInstances(structuredClone(toRaw(store.instances)));
  expect(state.readState.hasData).toBe(true);
});

it('matches Sonarr TVDB identities when TMDB is not provided', async () => {
  const state = setup([{ id: 2, tmdbId: 0, tvdbId: 20 }], 200, true, 'series');
  state.items.value[0]!.tvdbId = 20;
  await state.isAlreadyInLibrary();
  expect(state.items.value[0]).toMatchObject({ id: 2, already_in_library: true });
});
