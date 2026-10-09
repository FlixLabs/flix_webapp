import { afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useLibraryChecker } from '@/composables/useLibraryChecker';

afterEach(() => vi.unstubAllGlobals());

function setup(data: unknown, status = 200) {
  vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => data }));
  setActivePinia(createPinia());
  const config = { base_url: 'http://service.test', api_key: 'test', root_folder_path: '/media' };
  useFlixStore().setInstances([{ name: 'Test', radarr: config, sonarr: config }]);
  const items = ref([{ tmdbId: 10, title: 'Example', release_date: '2026-10-09' }]);
  const error = vi.fn();
  return { items, error, ...useLibraryChecker('movies', items, error, ref(true)) };
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
  expect(state.error).toHaveBeenCalledWith('Unable to check the library (HTTP 500).');
});

it('enriches valid library entries without replacing their upcoming date', async () => {
  const state = setup([{ id: 1, tmdbId: 10, year: 2025 }]);
  await state.isAlreadyInLibrary();
  expect(state.error).not.toHaveBeenCalled();
  expect(state.items.value[0]).toMatchObject({ year: 2025, release_date: '2026-10-09', already_in_library: true });
});
