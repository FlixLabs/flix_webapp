import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { canManualImport, useManualImport } from '@/composables/useManualImport';
import type { MediaInstance } from '@/composables/useMediaService';

const download = { title: 'Movie download', downloadId: 'download-token', outputPath: '/downloads/movie', status: 'completed' };
const movie = { id: 42, title: 'Movie' };
const series = { id: 7, title: 'Series' };
const episode = { id: 12, seasonNumber: 1, episodeNumber: 2, title: 'Second' };
const quality = { id: 4, name: 'HDTV-720p' };
const file = { id: 8, path: '/downloads/movie/Movie.mkv', movie, quality: { quality, revision: { version: 1, real: 0, isRepack: 0 } }, languages: [{ id: 1, name: 'English' }], rejections: [{ reason: 'Not an upgrade for existing movie file' }] };
function setup(mediaType: 'movies' | 'series' = 'movies') {
  const options = { useAPI: ref(true), selectedInstanceData: ref<MediaInstance | null>({ name: 'Test',
    radarr: { base_url: 'http://radarr.test', api_key: 'movie-key', root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: 'series-key', root_folder_path: '/tv' },
  }) };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/manualimport')) return Response.json(init?.method === 'POST'
      ? JSON.parse(String(init.body)).map((item: object) => ({ ...item, rejections: file.rejections }))
      : [mediaType === 'movies' ? file : { ...file, movie: undefined, series, episodes: [episode] }]);
    if (path.endsWith('/qualitydefinition')) return Response.json([{ quality }]);
    if (path.endsWith('/movie')) return Response.json([movie]);
    if (path.endsWith('/series')) return Response.json([series]);
    if (path.endsWith('/episode')) return Response.json([episode]);
    if (path.endsWith('/command')) return Response.json({ id: 99, status: 'queued' });
    return Response.json({ id: 99, status: 'completed' });
  });
  vi.stubGlobal('fetch', fetchMock);
  const scope = effectScope();
  const actions = scope.run(() => useManualImport(options))!;
  return { actions, options, fetchMock, scope };
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('manual download imports', () => {
  it('only offers import for completed downloads with a download identifier', () => {
    expect(canManualImport(download)).toBe(true);
    expect(canManualImport({ ...download, status: 'downloading' })).toBe(false);
    expect(canManualImport({ ...download, downloadId: undefined })).toBe(false);
    expect(canManualImport({ ...download, trackedDownloadState: 'imported' })).toBe(false);
    expect(canManualImport({ ...download, status: 'warning', trackedDownloadState: 'importBlocked' })).toBe(true);
  });
  it('inspects the download but never auto-selects files or issues a command', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    expect(actions.files.value).toHaveLength(1);
    expect(actions.selected.value).toEqual([]);
    expect(await actions.submit()).toBe(false);
    expect(fetchMock.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.get('downloadId')).toBe(download.downloadId);
    expect(url.searchParams.get('folder')).toBe(download.outputPath);
    expect(url.searchParams.has('movieId')).toBe(false);
    scope.stop();
  });
  it('reviews rejections then imports only confirmed files with explicit metadata', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    expect(await actions.submit()).toBe(false);
    await actions.review();
    expect(actions.confirming.value).toBe(true);
    expect(await actions.submit()).toBe(true);
    const commands = fetchMock.mock.calls.filter(([url]) => url.endsWith('/command'));
    expect(commands).toHaveLength(1);
    const payload = JSON.parse(String(commands[0]![1]?.body));
    expect(payload).toMatchObject({ name: 'ManualImport', importMode: 'auto', files: [{
      path: file.path, movieId: movie.id, downloadId: download.downloadId, quality: file.quality, languages: file.languages,
    }] });
    expect(actions.commandState.value).toBe('queued');
    expect(await actions.submit()).toBe(false);
    expect(await actions.checkStatus()).toBe(true);
    expect(actions.commandState.value).toBe('completed');
    scope.stop();
  });
  it('prevents import after the reviewed selection changes', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    actions.files.value[0]!.quality = { ...file.quality, revision: { version: 2 } };
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Selection changed');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it('requires matched episodes for Sonarr and scans downloads, not the series library', async () => {
    const { actions, fetchMock, scope } = setup('series');
    await actions.open('series', download);
    actions.files.value[0]!.selected = true;
    expect(actions.canReview.value).toBe(true);
    const url = new URL(fetchMock.mock.calls[0]![0]);
    expect(url.searchParams.has('seriesId')).toBe(false);
    await actions.review();
    expect(await actions.submit()).toBe(true);
    const command = fetchMock.mock.calls.find(([url]) => url.endsWith('/command'))!;
    expect(JSON.parse(String(command[1]?.body)).files[0]).toMatchObject({ seriesId: 7, episodeIds: [12] });
    scope.stop();
  });
  it('rejects invalid media, quality and episode selections', async () => {
    const { actions, scope } = setup('series');
    await actions.open('series', download);
    const candidate = actions.files.value[0]!;
    candidate.selected = true;
    candidate.episodeIds = [999];
    expect(actions.canReview.value).toBe(false);
    candidate.episodeIds = [12]; candidate.qualityId = 999;
    expect(actions.canReview.value).toBe(false);
    candidate.qualityId = 4; candidate.mediaId = 999;
    expect(actions.canReview.value).toBe(false);
    scope.stop();
  });
  it('invalidates the import immediately when the selected instance changes', async () => {
    const { actions, options, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    options.selectedInstanceData.value = null;
    expect(actions.dialog.value).toBe(false);
    expect(await actions.submit()).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it('supports standalone mode with direct service configuration', async () => {
    const { actions, options, fetchMock, scope } = setup();
    vi.stubEnv('VITE_RADARR_BASE_URL', 'http://standalone.test');
    vi.stubEnv('VITE_RADARR_API_KEY', 'standalone-key');
    options.useAPI.value = false;
    options.selectedInstanceData.value = null;
    await actions.open('movies', download);
    expect(actions.files.value).toHaveLength(1);
    expect(fetchMock.mock.calls[0]![0]).toContain('http://standalone.test/api/v3/manualimport');
    expect(fetchMock.mock.calls[0]![1]?.headers).toMatchObject({ 'X-Api-Key': 'standalone-key' });
    scope.stop();
  });
  it('keeps a failed inspection recoverable without sending an import', async () => {
    const { actions, fetchMock, scope } = setup();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await actions.open('movies', download);
    expect(actions.error.value).toContain('Unable to inspect');
    expect(actions.loading.value).toBe(false);
    expect(await actions.submit()).toBe(false);
    scope.stop();
  });
  it('does not allow another submission after an uncertain command outcome', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    fetchMock.mockRejectedValueOnce(new Error('connection lost'));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('whether the import was accepted');
    expect(await actions.submit()).toBe(false);
    expect(actions.canReview.value).toBe(false);
    scope.stop();
  });
});
