import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useDashboardActions } from '@/composables/useDashboardActions';
import type { MediaActionItem } from '@/composables/useMediaActions';
import type { MediaInstance } from '@/composables/useMediaService';

const scopes: ReturnType<typeof effectScope>[] = [];
function setup(useAPI = true) {
  const scope = effectScope();
  scopes.push(scope);
  const movie = { title: 'Movie', tmdbId: 10, selected_quality: 2, already_in_library: false };
  const series = { title: 'Series', tvdbId: 20, selected_quality: 3, already_in_library: false };
  const options = {
    useAPI: ref(useAPI),
    selectedInstanceData: ref<MediaInstance | null>({ name: 'First',
      radarr: { base_url: 'http://radarr', api_key: 'key', root_folder_path: '/movies' },
      sonarr: { base_url: 'http://sonarr', api_key: 'key', root_folder_path: '/tv' },
    }),
    movies: ref<(MediaActionItem & { selected_quality?: number })[]>([movie]),
    series: ref<(MediaActionItem & { selected_quality?: number })[]>([series]),
    showSuccessAlert: vi.fn(), showErrorAlert: vi.fn(),
  };
  const actions = scope.run(() => useDashboardActions(options))!;
  return { options, actions };
}
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('dashboard media actions', () => {
  it.each(['movies', 'series'] as const)('updates only the added %s without a lookup or library reload', async type => {
    const { options, actions } = setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 42 })));
    vi.stubGlobal('fetch', fetchMock);
    const item = options[type].value[0]!;
    const originalList = options[type].value;
    await actions.addItem(type, item);
    expect(options[type].value).toBe(originalList);
    expect(item).toMatchObject({ id: 42, already_in_library: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).qualityProfileId).toBe(item.selected_quality);
    expect(options.showErrorAlert).not.toHaveBeenCalled();
  });

  it.each(['movies', 'series'] as const)('updates deleted %s locally, retaining the search result', async type => {
    const { options, actions } = setup();
    const item = options[type].value[0]!;
    Object.assign(item, { id: 42, already_in_library: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await actions.deleteItem(type, item);
    expect(item).toMatchObject({ id: undefined, already_in_library: false });
    expect(options[type].value).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/42?deleteFiles=true');
  });

  it('shows pending state immediately and ignores repeated clicks', async () => {
    const { options, actions } = setup();
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const item = options.movies.value[0]!;
    const request = actions.addItem('movies', item);
    expect(actions.isPending('movies', item)).toBe(true);
    await actions.addItem('movies', item);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(item.already_in_library).toBe(false);
    finish(new Response(JSON.stringify({ id: 42 })));
    await request;
    expect(actions.isPending('movies', item)).toBe(false);
  });

  it.each(['addItem', 'deleteItem'] as const)('leaves the media unchanged when %s fails', async action => {
    const { options, actions } = setup();
    const item = options.movies.value[0]!;
    Object.assign(item, { id: 42, already_in_library: action === 'deleteItem' });
    const before = { ...item };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await actions[action]('movies', item);
    expect(item).toEqual(before);
    expect(actions.isPending('movies', item)).toBe(false);
    expect(options.showErrorAlert).toHaveBeenCalled();
  });

  it('does not create a removable item without the service ID', async () => {
    const { options, actions } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await actions.addItem('movies', options.movies.value[0]!);
    expect(options.movies.value[0]?.already_in_library).toBe(false);
    expect(options.showErrorAlert).toHaveBeenCalledWith(expect.stringContaining('Search again'));
  });

  it('does not apply a response from the previous instance', async () => {
    const { options, actions } = setup();
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const request = actions.addItem('movies', options.movies.value[0]!);
    options.selectedInstanceData.value = { ...options.selectedInstanceData.value!, name: 'Second' };
    finish(new Response(JSON.stringify({ id: 42 })));
    await request;
    expect(options.movies.value[0]?.already_in_library).toBe(false);
  });

  it('continues to use direct Radarr configuration without the Flix API', async () => {
    vi.stubEnv('VITE_RADARR_BASE_URL', 'http://direct-radarr');
    vi.stubEnv('VITE_RADARR_API_KEY', 'direct-key');
    vi.stubEnv('VITE_RADARR_ROOT_FOLDER_PATH', '/movies');
    const { options, actions } = setup(false);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 42 })));
    vi.stubGlobal('fetch', fetchMock);
    await actions.addItem('movies', options.movies.value[0]!);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://direct-radarr/api/v3/movie');
    expect(options.movies.value[0]?.id).toBe(42);
  });
});
