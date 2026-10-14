import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { downloadMediaId, useDownloadMediaSheet } from '@/composables/useDownloadMediaSheet';
import { showRawDownloadStatus } from '@/composables/useDownloadDetails';
import type { MediaInstance } from '@/composables/useMediaService';

const scopes: ReturnType<typeof effectScope>[] = [];
const setup = () => {
  const config = { base_url: 'http://service.test', api_key: 'test-only', root_folder_path: '/media' };
  const options = { useAPI: ref(true), selectedInstanceData: ref<MediaInstance | null>({ name: 'First', radarr: config, sonarr: config }) };
  const scope = effectScope(); scopes.push(scope);
  const sheet = scope.run(() => useDownloadMediaSheet(options))!;
  return { sheet, options };
};
const button = {} as HTMLElement;
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('download media identity', () => {
  it('never uses queue, episode or download IDs as media IDs', () => {
    expect(downloadMediaId('movies', { id: 101, downloadId: 'hash', movieId: 42 })).toBe(42);
    expect(downloadMediaId('series', { id: 101, episodeId: 10, seriesId: 43 })).toBe(43);
    expect(downloadMediaId('movies', { id: 101, title: 'A.Movie.2026' })).toBeUndefined();
    expect(downloadMediaId('series', { id: 101, episodeId: 10 })).toBeUndefined();
  });
  it('supports nested service resources without confusing movies and series', () => {
    expect(downloadMediaId('movies', { movie: { id: 42 } })).toBe(42);
    expect(downloadMediaId('series', { series: { id: 43 } })).toBe(43);
    expect(downloadMediaId('series', { movieId: 42 })).toBeUndefined();
  });
  it.each([0, -1, 1.2, '42', null, undefined])('rejects invalid media ID %s', id => {
    expect(downloadMediaId('movies', { movieId: id })).toBeUndefined();
    expect(downloadMediaId('series', { seriesId: id })).toBeUndefined();
  });
});

describe('download status display', () => {
  it('hides duplicate labels regardless of capitalization and whitespace', () => {
    expect(showRawDownloadStatus(' downloading ', 'Downloading')).toBe(false);
    expect(showRawDownloadStatus('paused', 'Paused')).toBe(false);
    expect(showRawDownloadStatus(undefined, 'Waiting')).toBe(false);
  });
  it('retains distinct technical statuses', () => {
    expect(showRawDownloadStatus('completed', 'Import needs attention')).toBe(true);
    expect(showRawDownloadStatus('downloading', 'Needs attention')).toBe(true);
  });
});

describe('download media sheet', () => {
  it('loads the canonical movie once, in read-only mode, and retains file details', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 42, title: 'Movie', images: [], movieFile: { relativePath: 'Movie.mkv', size: 4000 } })));
    vi.stubGlobal('fetch', fetcher);
    const { sheet } = setup();
    sheet.open('movies', { mediaId: 42, title: 'Release name' }, button);
    await vi.waitFor(() => expect(sheet.state.hasData).toBe(true));
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://service.test/api/v3/movie/42');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sheet.item.value).toMatchObject({ title: 'Movie', relativePath: 'Movie.mkv', sizeOnDisk: 4000 });
    expect(sheet.activator.value).toBe(button);
  });
  it('reports mismatched media identity and permits a retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 99, title: 'Wrong' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 42, title: 'Series' })));
    vi.stubGlobal('fetch', fetcher);
    const { sheet } = setup();
    sheet.open('series', { mediaId: 42 }, button);
    await vi.waitFor(() => expect(sheet.state.error).toContain('Invalid media'));
    expect(sheet.state.hasData).toBe(false);
    await sheet.retry();
    expect(sheet.item.value?.title).toBe('Series');
    expect(sheet.state.error).toBe('');
  });
  it('explains a removed media instead of showing the release as its identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const { sheet } = setup();
    sheet.open('movies', { mediaId: 42 }, button);
    await vi.waitFor(() => expect(sheet.state.error).toContain('no longer available'));
    expect(sheet.state.hasData).toBe(false);
  });
  it.each(['close', 'instance'])('discards a delayed response after %s', async action => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const { sheet, options } = setup();
    sheet.open('movies', { mediaId: 42, title: 'Release' }, button);
    if (action === 'close') sheet.dialog.value = false;
    else options.selectedInstanceData.value = { ...options.selectedInstanceData.value!, name: 'Second' };
    finish(new Response(JSON.stringify({ id: 42, title: 'Old movie' })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sheet.dialog.value).toBe(false);
    expect(sheet.item.value?.title).toBe('Release');
    expect(sheet.state.hasData).toBe(false);
  });
  it('uses standalone service configuration without an instance', async () => {
    vi.stubEnv('VITE_SONARR_BASE_URL', 'http://direct.test'); vi.stubEnv('VITE_SONARR_API_KEY', 'test-only');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 42, title: 'Series' })));
    vi.stubGlobal('fetch', fetcher);
    const { sheet, options } = setup();
    options.useAPI.value = false; options.selectedInstanceData.value = null;
    sheet.open('series', { mediaId: 42 }, button);
    await vi.waitFor(() => expect(sheet.state.hasData).toBe(true));
    expect(fetcher.mock.calls[0]?.[0]).toBe('http://direct.test/api/v3/series/42');
  });
});
