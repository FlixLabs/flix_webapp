import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { canManualImport, useManualImport } from '@/composables/useManualImport';
import { trackedImports } from '@/composables/manualImportTracking';
import type { MediaInstance } from '@/composables/useMediaService';

const download = { title: 'Movie download', downloadId: 'download-token', outputPath: '/downloads/movie', status: 'completed', trackedDownloadState: 'importBlocked' };
const rejectedUpgrade = { ...download, trackedDownloadState: 'importPending', trackedDownloadStatus: 'warning',
  statusMessages: [{ title: 'Movie.mkv', messages: ['Not an upgrade for existing movie file'] }] };
const rejectedParse = { ...rejectedUpgrade, statusMessages: [{ title: 'Dracula (coppola) - 1080p FR EN x264 ac3 mHDgz.mkv', messages: ['Unable to parse file'] }] };
const movie = { id: 42, title: 'Movie' };
const series = { id: 7, title: 'Series' };
const episode = { id: 12, seasonNumber: 1, episodeNumber: 2, title: 'Second' };
const quality = { id: 4, name: 'HDTV-720p' };
const file = { id: 8, path: '/downloads/movie/Movie.mkv', movie, quality: { quality, revision: { version: 1, real: 0, isRepack: false } }, languages: [{ id: 1, name: 'English' }], rejections: [{ reason: 'Not an upgrade for existing movie file' }] };
const parseFailure = (path: string) => ({ message: `Unable to parse movie info from path: ${path}`,
  description: 'NzbDrone.Core.MediaFiles.MovieImport.Aggregation.AugmentingFailedException: Unable to parse movie info from path' });
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
    if (path.endsWith('/language')) return Response.json([{ id: 1, name: 'English' }, { id: 2, name: 'French' }]);
    if (path.endsWith('/movie')) return Response.json([movie]);
    if (path.endsWith('/series')) return Response.json([series]);
    if (path.endsWith('/episode')) return Response.json([episode]);
    if (path.endsWith('/command')) return Response.json({ id: 99, status: 'queued' });
    return Response.json({ id: 99, status: 'completed' });
  });
  const checks = vi.fn(async (url: string) => Response.json(new URL(url).pathname.endsWith('/queue')
    ? { totalRecords: 1, records: [{ id: 101, downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importBlocked' }] } : []));
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    return path.endsWith('/queue') || (path.endsWith('/command') && init?.method === 'GET') ? checks(url) : fetchMock(url, init);
  });
  const scope = effectScope();
  const actions = scope.run(() => useManualImport(options))!;
  return { actions, options, fetchMock, checks, scope };
}
afterEach(() => { trackedImports.value = []; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('manual download imports', () => {
  it.each(['movies', 'series'] as const)('reviews and confirms an unparseable pending %s download without resubmission', async type => {
    const { actions, fetchMock, checks, scope } = setup(type);
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedParse }] } : []));
    await actions.open(type, rejectedParse);
    expect(actions.error.value).toBe('');
    expect(actions.files.value).toHaveLength(1);
    expect(actions.selected.value).toHaveLength(0);
    actions.files.value[0]!.selected = true;
    await actions.review();
    expect(actions.confirming.value).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    expect(await actions.submit()).toBe(true);
    expect(await actions.submit()).toBe(false);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/command'))).toHaveLength(1);
    await actions.open(type, rejectedParse);
    expect(actions.commandId.value).toBe(99);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/command'))).toHaveLength(1);
    scope.stop();
  });
  it.each([
    { trackedDownloadState: 'importing' }, { status: 'downloading' }, { trackedDownloadStatus: 'ok' },
    { statusMessages: [{ title: 'Unable to parse file', messages: [] }] },
    { statusMessages: [{ messages: ['Unable to parse file', 'Waiting for automatic import'] }] },
    { statusMessages: [{ messages: ['Unable to parse file while importing'] }] },
    { statusMessages: [{ messages: ['Unable to parse file'] }, { messages: ['Unknown warning'] }] },
  ])('keeps ambiguous unparseable pending downloads protected: %j', changes => {
    expect(canManualImport({ ...rejectedParse, ...changes })).toBe(false);
  });
  it.each(['queued', 'started'])('blocks unparseable pending downloads when a native import is %s', async status => {
    const { actions, checks, fetchMock, scope } = setup();
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedParse }] }
      : [{ name: 'ManualImport', status, body: { files: [{ downloadId: download.downloadId }] } }]));
    await actions.open('movies', rejectedParse);
    expect(actions.error.value).toContain(status === 'queued' ? 'Import queued' : 'Import in progress');
    expect(fetchMock).not.toHaveBeenCalled();
    scope.stop();
  });
  it('revalidates an unparseable rejection and commands before confirmation', async () => {
    const { actions, checks, fetchMock, scope } = setup();
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedParse }] } : []));
    await actions.open('movies', rejectedParse);
    actions.files.value[0]!.selected = true;
    await actions.review();
    checks.mockResolvedValueOnce(Response.json({ totalRecords: 1, records: [{ id: 101, ...rejectedParse, statusMessages: [] }] }));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import queued');
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedParse }] }
      : [{ name: 'DownloadedMoviesScan', status: 'started', body: { downloadClientId: download.downloadId } }]));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import in progress');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it.each([
    'Not an upgrade for existing movie file',
    'Not an upgrade for existing episode file(s). Existing quality: Bluray-1080p. New Quality HDTV-720p.',
    'Not a quality revision upgrade for existing movie file(s)',
    'Not a Custom Format upgrade for existing episode file(s). New: [] (0) do not improve on Existing: [] (10)',
  ])('recognizes an explicit pending upgrade rejection: %s', message => {
    expect(canManualImport({ ...rejectedUpgrade, statusMessages: [{ messages: [message] }] })).toBe(true);
  });
  it.each([
    { status: 'downloading' }, { status: undefined }, { trackedDownloadState: 'importing' },
    { trackedDownloadStatus: 'ok' }, { errorMessage: 'Import is running' },
    { statusMessages: [] }, { statusMessages: [{ title: 'Not an upgrade for existing movie file', messages: [] }] },
    { statusMessages: [{ messages: ['Not an upgrade for existing movie file', 'Waiting for import'] }] },
    { statusMessages: [{ messages: ['Not an upgrade for existing movie file'] }, { messages: ['Unknown warning'] }] },
    { statusMessages: [{ messages: [null] }] }, { statusMessages: [{ messages: ['Not an upgrade for existing movie filename'] }] },
  ])('does not relax protection for ambiguous pending downloads: %j', changes => {
    expect(canManualImport({ ...rejectedUpgrade, ...changes })).toBe(false);
  });
  it.each(['movies', 'series'] as const)('reviews and explicitly submits a rejected pending %s upgrade', async type => {
    const { actions, fetchMock, checks, scope } = setup(type);
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedUpgrade }] } : []));
    await actions.open(type, rejectedUpgrade);
    expect(actions.files.value).toHaveLength(1);
    expect(actions.error.value).toBe('');
    actions.files.value[0]!.selected = true;
    await actions.review();
    expect(actions.confirming.value).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    expect(await actions.submit()).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/command'))).toHaveLength(1);
    scope.stop();
  });
  it.each(['queued', 'started'])('still blocks a rejected upgrade with a %s native command', async status => {
    const { actions, fetchMock, checks, scope } = setup();
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedUpgrade }] }
      : [{ name: 'ManualImport', status, body: { files: [{ downloadId: download.downloadId }] } }]));
    await actions.open('movies', rejectedUpgrade);
    expect(actions.files.value).toHaveLength(0);
    expect(actions.error.value).toContain(status === 'queued' ? 'Import queued' : 'Import in progress');
    expect(fetchMock).not.toHaveBeenCalled();
    scope.stop();
  });
  it('rechecks the rejection and native commands before confirming a pending upgrade', async () => {
    const { actions, fetchMock, checks, scope } = setup();
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedUpgrade }] } : []));
    await actions.open('movies', rejectedUpgrade);
    actions.files.value[0]!.selected = true;
    await actions.review();
    checks.mockResolvedValueOnce(Response.json({ totalRecords: 1, records: [{ id: 101, ...rejectedUpgrade, statusMessages: [] }] }));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import queued');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, ...rejectedUpgrade }] }
      : [{ name: 'DownloadedMoviesScan', status: 'started', body: { downloadClientId: download.downloadId } }]));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import in progress');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it.each(['movies', 'series'] as const)('blocks %s importPending even without an active native command', async type => {
    const { actions, checks, scope } = setup(type);
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importPending' }] } : []));
    await actions.open(type, { ...download, trackedDownloadState: 'importPending' });
    expect(actions.files.value).toEqual([]);
    expect(actions.error.value).toContain('failed or rejected automatic import');
    expect(checks).not.toHaveBeenCalled();
    scope.stop();
  });
  it('blocks a stale eligible download when its fresh queue state is importPending', async () => {
    const { actions, checks, scope } = setup();
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importPending' }] }
      : [{ name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: download.downloadId }] } }]));
    await actions.open('movies', download);
    expect(actions.files.value).toEqual([]);
    expect(actions.error.value).toContain('Import queued');
    scope.stop();
  });
  it.each(['movies', 'series'] as const)('blocks %s when a queued command exists outside this browser session', async type => {
    const { actions, fetchMock, checks, scope } = setup(type);
    checks.mockImplementation(async url => Response.json(new URL(url).pathname.endsWith('/queue')
      ? { totalRecords: 1, records: [{ id: 101, downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importBlocked' }] }
      : [{ name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: download.downloadId }] } }]));
    await actions.open(type, download);
    expect(actions.error.value).toContain('Import queued');
    expect(actions.files.value).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    scope.stop();
  });
  it('rechecks native imports immediately before submission', async () => {
    const { actions, fetchMock, checks, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    checks.mockResolvedValueOnce(Response.json({ totalRecords: 1, records: [{ id: 101, downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importing' }] }));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import in progress');
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/command') && init?.method === 'POST')).toBe(false);
    scope.stop();
  });
  it('fails closed when native import verification is unavailable', async () => {
    const { actions, fetchMock, checks, scope } = setup();
    checks.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await actions.open('movies', download);
    expect(actions.error.value).toContain('Import status unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(canManualImport({ ...download, trackedDownloadState: 'importPending' })).toBe(false);
    scope.stop();
  });
  it('offers manual continuation only after the exact parser failure, then requires explicit confirmation', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    expect(actions.canContinueManually.value).toBe(false);
    actions.continueManually();
    expect(actions.confirming.value).toBe(false);
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    expect(actions.error.value).toContain('could not parse');
    expect(actions.canContinueManually.value).toBe(true);
    expect(await actions.submit()).toBe(false);
    actions.continueManually();
    expect(actions.manualReview.value).toBe(true);
    expect(actions.confirming.value).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    expect(await actions.submit()).toBe(true);
    const commands = fetchMock.mock.calls.filter(([url, init]) => url.endsWith('/command') && init?.method === 'POST');
    expect(commands).toHaveLength(1);
    expect(JSON.parse(String(commands[0]![1]!.body))).toMatchObject({ name: 'ManualImport', files: [{
      path: file.path, movieId: movie.id, quality: file.quality, languages: file.languages,
    }] });
    expect(await actions.submit()).toBe(false);
    scope.stop();
  });
  it.each([
    ['another path', 500, parseFailure('/downloads/another.mkv')],
    ['another exception', 500, { ...parseFailure(file.path), description: 'System.UnauthorizedAccessException: denied' }],
    ['another status', 400, parseFailure(file.path)],
    ['generic failure', 500, { message: 'Internal server error' }],
  ])('does not enable continuation for %s', async (_, status, failure) => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    fetchMock.mockResolvedValueOnce(Response.json(failure, { status: Number(status) }));
    await actions.review();
    expect(actions.canContinueManually.value).toBe(false);
    actions.continueManually();
    expect(actions.confirming.value).toBe(false);
    expect(await actions.submit()).toBe(false);
    scope.stop();
  });
  it('invalidates manual continuation when metadata changes, and requires known languages', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    const candidate = actions.files.value[0]!;
    candidate.selected = true;
    candidate.languages = [];
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    expect(actions.canContinueManually.value).toBe(false);
    candidate.languages = [{ id: 999, name: 'Not configured' }];
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    expect(actions.canContinueManually.value).toBe(false);
    candidate.languages = [{ id: 1, name: 'English' }];
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    actions.continueManually();
    candidate.languages = [{ id: 2, name: 'French' }];
    expect(actions.canContinueManually.value).toBe(false);
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Selection changed');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it('does not offer the movie-only fallback to Sonarr or batches', async () => {
    const { actions, fetchMock, scope } = setup('series');
    await actions.open('series', download);
    actions.files.value[0]!.selected = true;
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    expect(actions.canContinueManually.value).toBe(false);
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    actions.files.value.push({ ...actions.files.value[0]!, path: '/downloads/second.mkv' });
    fetchMock.mockResolvedValueOnce(Response.json(parseFailure(file.path), { status: 500 }));
    await actions.review();
    expect(actions.canContinueManually.value).toBe(false);
    actions.close();
    expect(actions.canContinueManually.value).toBe(false);
    scope.stop();
  });
  it('reviews unparseable filenames using explicitly selected quality and multiple languages', async () => {
    const { actions, fetchMock, scope } = setup();
    const path = '/downloads/movie/[ OxTorrent.com ] Mad Max 2 -1080p.MULTI.x264 ac3 mHDgz.mkv';
    fetchMock.mockResolvedValueOnce(Response.json([{ ...file, path, quality: { quality: { id: 0, name: 'Unknown' }, revision: null }, languages: [], rejections: [{ reason: 'Unable to parse file' }] }]));
    await actions.open('movies', download);
    const candidate = actions.files.value[0]!;
    candidate.selected = true;
    expect(actions.canReview.value).toBe(false);
    candidate.qualityId = quality.id;
    candidate.languages = [...actions.languages.value];
    await actions.review();
    expect(actions.confirming.value).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    expect(await actions.submit()).toBe(true);
    const command = fetchMock.mock.calls.find(([url]) => url.endsWith('/command'))!;
    expect(JSON.parse(String(command[1]?.body)).files[0]).toMatchObject({ path, movieId: movie.id,
      quality: { quality, revision: { version: 1, real: 0, isRepack: false } },
      languages: [{ id: 1, name: 'English' }, { id: 2, name: 'French' }],
    });
    scope.stop();
  });
  it('requires another review when languages change after confirmation was prepared', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    actions.files.value[0]!.languages = [{ id: 2, name: 'French' }];
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Selection changed');
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it('reports review HTTP failures without issuing an import command', async () => {
    const { actions, fetchMock, scope } = setup();
    await actions.open('movies', download);
    actions.files.value[0]!.selected = true;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await actions.review();
    expect(actions.error.value).toContain('HTTP 400');
    expect(actions.confirming.value).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/command'))).toBe(false);
    scope.stop();
  });
  it('only offers import after an explicit automatic import failure or rejection', () => {
    expect(canManualImport(download)).toBe(true);
    expect(canManualImport({ ...download, status: 'downloading' })).toBe(false);
    expect(canManualImport({ ...download, downloadId: undefined })).toBe(false);
    expect(canManualImport({ ...download, trackedDownloadState: 'imported' })).toBe(false);
    expect(canManualImport({ ...download, status: 'warning', trackedDownloadState: 'importBlocked' })).toBe(true);
    expect(canManualImport({ ...download, trackedDownloadState: 'importFailed' })).toBe(true);
    for (const trackedDownloadState of [undefined, '', 'unknown', 'downloading', 'importPending', 'importing', 'imported']) {
      expect(canManualImport({ ...download, trackedDownloadState })).toBe(false);
    }
  });
  it.each(['movies', 'series'] as const)('blocks %s submission if automatic import eligibility disappears during review', async type => {
    const { actions, fetchMock, checks, scope } = setup(type);
    await actions.open(type, download);
    actions.files.value[0]!.selected = true;
    await actions.review();
    checks.mockResolvedValueOnce(Response.json({ totalRecords: 1, records: [{ id: 101,
      downloadId: download.downloadId, status: 'completed', trackedDownloadState: 'importPending' }] }));
    expect(await actions.submit()).toBe(false);
    expect(actions.error.value).toContain('Import queued');
    expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/command') && init?.method === 'POST')).toBe(false);
    scope.stop();
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
    actions.files.value[0]!.selected = true;
    await actions.review();
    expect(await actions.submit()).toBe(true);
    actions.close();
    expect(actions.commandState.value).toBe('queued');
    expect(await actions.submit()).toBe(false);
    await actions.open('movies', download);
    expect(actions.commandId.value).toBe(99);
    expect(actions.files.value).toEqual([]);
    expect(await actions.submit()).toBe(false);
    expect(await actions.checkStatus()).toBe(true);
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
