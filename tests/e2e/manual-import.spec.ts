import { test, expect, movie, series } from './fixtures';
import type { Page } from '@playwright/test';
import { closeWithoutCollapsing } from './dialog-transition';

const filename = 'Example.Movie.2025.720p.mkv';
const candidate = { id: 8, path: `/downloads/example/${filename}`, relativePath: filename, size: 2e9,
  movie, series, episodes: [{ id: 21, seasonNumber: 1, episodeNumber: 1, title: 'Pilot' }],
  quality: { quality: { id: 4, name: 'HDTV-720p' }, revision: { version: 1, real: 0, isRepack: false } },
  languages: [{ id: 1, name: 'English' }], rejections: [{ reason: 'Not an upgrade for existing file' }],
};
async function mockImport(page: Page, mutations: { method: string; path: string; body: unknown }[], reviewStatus = 200, command = { status: 'completed' }, pendingUpgrade = false, rejection = 'Not an upgrade for existing movie file') {
  await page.route(/\/api\/v3\/queue\?/, route => route.fulfill({ json: { totalRecords: 1, records: [{ id: 101, title: 'Completed download',
    downloadId: 'download-1', outputPath: '/downloads/example', status: 'completed', trackedDownloadState: pendingUpgrade ? 'importPending' : 'importBlocked',
    trackedDownloadStatus: 'warning',
    size: 2e9, sizeleft: 0, languages: [], statusMessages: [{ title: 'Unable to import automatically', messages: [rejection] }],
  }] } }));
  await page.route(/\/api\/v3\/manualimport(?:\?|$)/, route => {
    if (route.request().method() === 'POST') {
      mutations.push({ method: 'POST', path: '/api/v3/manualimport', body: route.request().postDataJSON() });
      return route.fulfill({ status: reviewStatus, json: [candidate] });
    }
    return route.fulfill({ json: [candidate] });
  });
  await page.route(/\/api\/v3\/qualitydefinition$/, route => route.fulfill({ json: [{ quality: candidate.quality.quality }] }));
  await page.route(/\/api\/v3\/language$/, route => route.fulfill({ json: [{ id: 1, name: 'English' }, { id: 2, name: 'French' }] }));
  await page.route(/\/api\/v3\/command(?:\/99)?$/, route => {
    if (route.request().method() === 'POST') {
      mutations.push({ method: 'POST', path: '/api/v3/command', body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: 99, status: 'queued' } });
    }
    return route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/command') ? [] : { id: 99, status: command.status } });
  });
}

for (const type of ['movies', 'series']) for (const nativeStarts of [false, true]) {
  test(`${type} rejected pending upgrade ${nativeStarts ? 'blocks a new native import' : 'allows explicit manual confirmation'}`, async ({ page, mutations }) => {
    await mockImport(page, mutations, 200, { status: 'completed' }, true);
    await page.goto('/downloads');
    if (type === 'series') await page.getByRole('button', { name: /^Series/ }).click();
    await expect(page.getByText('Automatic import rejected; manual review is available. Removal remains protected.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Completed download', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
    await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
    await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true });
    await expect(confirmation).toBeVisible();
    expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
    if (nativeStarts) await page.route('**/api/v3/command', route => route.fulfill({ json: [
      { name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: 'download-1' }] } },
    ] }));
    await confirmation.getByRole('button', { name: 'Confirm Import', exact: true }).click();
    if (nativeStarts) {
      await expect(confirmation.getByText('Import queued. No new import was requested.', { exact: true })).toBeVisible();
      expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
    } else {
      await expect.poll(() => mutations.filter(item => item.path === '/api/v3/command').length).toBe(1);
    }
  });
}

test('closing a loading manual import keeps its progress view until the transition ends', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  await page.route(/\/api\/v3\/manualimport(?:\?|$)/, async route => {
    await waiting;
    await route.fulfill({ json: [candidate] }).catch(() => {});
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true });
  await expect(dialog.getByRole('progressbar', { name: 'Inspecting download' })).toBeVisible();
  await closeWithoutCollapsing(dialog);
  finish();
  expect(mutations).toEqual([]);
});

test('manual import reviews rejected files and requires explicit confirmation before replacing', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await expect(page.getByText('Manual import can replace an existing file', { exact: false })).toBeVisible();
  const review = page.getByRole('button', { name: 'Review Import (0)', exact: true });
  await expect(review).toBeDisabled();
  expect(mutations).toEqual([]);
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toHaveClass(/text-warning/);
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveClass(/text-on-surface/);
  expect(mutations.map(item => item.path)).toEqual(['/api/v3/manualimport']);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import completed', { exact: true })).toBeVisible();
  const commands = mutations.filter(item => item.path === '/api/v3/command');
  expect(commands).toHaveLength(1);
  expect(commands[0]!.body).toMatchObject({ name: 'ManualImport', importMode: 'auto', files: [{ path: candidate.path, movieId: movie.id, downloadId: 'download-1' }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('manual import is not offered for an active download', async ({ page, mutations }) => {
  await page.goto('/downloads');
  await expect(page.getByText('Download example', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Manual import / })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

for (const type of ['movies', 'series']) {
  test(`${type} rejects a native import that was queued outside Flix`, async ({ page, mutations }) => {
    await mockImport(page, mutations);
    await page.route(/\/api\/v3\/command$/, route => route.fulfill({ json: [{ name: 'ManualImport', status: 'queued', body: { files: [{ downloadId: 'download-1' }] } }] }));
    await page.goto('/downloads');
    if (type === 'series') await page.getByRole('button', { name: /^Series/ }).click();
    await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
    await expect(page.getByText('Import queued. No new import was requested.', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    expect(mutations).toEqual([]);
  });
}

test('a native import starting during review prevents a duplicate command on confirmation', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  let queued = false;
  await page.route(/\/api\/v3\/command$/, route => {
    if (route.request().method() !== 'GET') {
      mutations.push({ method: 'POST', path: '/api/v3/command', body: route.request().postDataJSON() });
      return route.fulfill({ json: { id: 99, status: 'queued' } });
    }
    return route.fulfill({ json: queued ? [{ name: 'DownloadedMoviesScan', status: 'started', body: { downloadClientId: 'download-1' } }] : [] });
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true });
  await expect(confirmation).toBeVisible();
  queued = true;
  await confirmation.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(confirmation.getByText('Import in progress. No new import was requested.', { exact: true })).toBeVisible();
  expect(mutations.filter(item => item.path === '/api/v3/command')).toEqual([]);
});

test('a failed review never sends an import command', async ({ page, mutations }) => {
  await mockImport(page, mutations, 500);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect(page.getByText('Unable to review the selected files (HTTP 500). Check the media, quality and languages. No import was requested.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm Import', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with manual information', exact: true })).toHaveCount(0);
  expect(mutations.map(item => item.path)).toEqual(['/api/v3/manualimport']);
});

test('the specific Radarr parsing failure allows explicit manual confirmation without renaming', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  const path = '/downloads/[ OxTorrent.com ] Mad Max 1-1080p.MULTI.x264 ac3 mHDgz.mkv';
  await page.route(/\/api\/v3\/manualimport(?:\?|$)/, route => {
    if (route.request().method() === 'POST') {
      mutations.push({ method: 'POST', path: '/api/v3/manualimport', body: route.request().postDataJSON() });
      return route.fulfill({ status: 500, json: { message: `Unable to parse movie info from path: ${path}`,
        description: 'NzbDrone.Core.MediaFiles.MovieImport.Aggregation.AugmentingFailedException: parsing failed' } });
    }
    return route.fulfill({ json: [{ ...candidate, path, relativePath: path.split('/').pop() }] });
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${path.split('/').pop()}`, exact: true }).check();
  const continuation = page.getByRole('button', { name: 'Continue with manual information', exact: true });
  await expect(continuation).toHaveCount(0);
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect(page.getByText('Radarr could not parse this filename. No import was requested.', { exact: true })).toBeVisible();
  await continuation.click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true });
  await expect(confirmation.getByText('Radarr could not verify this filename.', { exact: false })).toBeVisible();
  expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
  await continuation.click();
  await confirmation.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect.poll(() => mutations.filter(item => item.path === '/api/v3/command').length).toBe(1);
  expect(mutations.find(item => item.path === '/api/v3/command')!.body).toMatchObject({
    name: 'ManualImport', files: [{ path, movieId: movie.id, quality: candidate.quality, languages: candidate.languages }],
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Sonarr imports only the selected episode associations', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Episodes', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import completed', { exact: true })).toBeVisible();
  const command = mutations.find(item => item.path === '/api/v3/command');
  expect(command?.body).toMatchObject({ files: [{ seriesId: series.id, episodeIds: [21] }] });
});

test('accepted imports remain visible after closing and reloading without resubmission', async ({ page, mutations }, testInfo) => {
  const command = { status: 'started' };
  await mockImport(page, mutations, 200, command);
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect(page.getByText('Import launched', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true })).not.toBeVisible();
  const activity = page.locator('.v-card').filter({ has: page.getByText('Manual imports', { exact: true }) });
  await expect(activity.getByText('Importing', { exact: true })).toBeVisible();
  await expect(page.getByText('Manual import: Importing', { exact: true })).toBeVisible();
  await activity.screenshot({ path: testInfo.outputPath('manual-import-tracking.png') });
  const stored = await page.evaluate(() => sessionStorage.getItem('flix:manual-imports:v1'));
  expect(stored).not.toContain('/downloads/example');
  expect(stored).not.toContain('test-only');
  await page.reload();
  await expect(activity.getByText('Importing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true });
  await expect(dialog.getByText('Import launched', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Review Import/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  command.status = 'failed';
  await activity.getByRole('button', { name: 'Check import status for Completed download', exact: true }).click();
  await expect(activity.getByText('Failed', { exact: true })).toBeVisible();
  command.status = 'completed';
  await activity.getByRole('button', { name: 'Check import status for Completed download', exact: true }).click();
  await expect(activity.getByText('Completed', { exact: true })).toBeVisible();
  expect(mutations.filter(item => item.path === '/api/v3/command')).toHaveLength(1);
  await activity.getByRole('button', { name: 'Dismiss import status for Completed download', exact: true }).click();
  await expect(activity).not.toBeVisible();
});

for (const status of ['started', 'completed', 'failed']) {
  test(`accepted ${status} imports can be dismissed without cancelling or resubmitting`, async ({ page, mutations }, testInfo) => {
    await mockImport(page, mutations, 200, { status });
    await page.goto('/downloads');
    const opener = page.getByRole('button', { name: 'Manual import Completed download', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true });
    await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
    await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Import', exact: true }).click();
    const label = status === 'started' ? 'Import launched' : status === 'completed' ? 'Import completed' : 'Import failed';
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
    if (testInfo.project.name === 'mobile') await page.keyboard.press('Escape');
    else await page.locator('.v-dialog.v-overlay--active .v-overlay__scrim').last().click({ position: { x: 8, y: 8 } });
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.getByText('Manual imports', { exact: true })).toBeVisible();
    expect(mutations.filter(item => item.path === '/api/v3/command')).toHaveLength(1);
    expect(mutations.every(item => item.method === 'POST' && ['/api/v3/manualimport', '/api/v3/command'].includes(item.path))).toBe(true);
  });
}

test('review and submission remain protected against accidental dismissal', async ({ page, mutations }) => {
  await mockImport(page, mutations);
  let finishReview!: () => void;
  let finishSubmission!: () => void;
  await page.route(/\/api\/v3\/manualimport$/, async route => {
    mutations.push({ method: 'POST', path: '/api/v3/manualimport', body: route.request().postDataJSON() });
    await new Promise<void>(resolve => { finishReview = resolve; });
    await route.fulfill({ json: [candidate] });
  });
  await page.route(/\/api\/v3\/command$/, async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    mutations.push({ method: 'POST', path: '/api/v3/command', body: route.request().postDataJSON() });
    await new Promise<void>(resolve => { finishSubmission = resolve; });
    await route.fulfill({ json: { id: 99, status: 'queued' } });
  });
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true });
  await page.getByRole('checkbox', { name: `Select ${filename}`, exact: true }).check();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect.poll(() => !!finishReview).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  finishReview();
  const confirmation = page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true });
  await expect(confirmation).toBeVisible();
  // Escape dismisses the idle confirmation, not its parent or the selected files.
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('checkbox', { name: `Select ${filename}`, exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  await expect.poll(() => mutations.filter(item => item.path === '/api/v3/manualimport').length).toBe(2);
  finishReview();
  await confirmation.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect.poll(() => !!finishSubmission).toBe(true);
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();
  await expect(dialog).toBeVisible();
  finishSubmission();
  await expect(confirmation).toBeHidden();
  await expect(dialog.getByText('Import launched', { exact: true })).toBeVisible();
  expect(mutations.filter(item => item.path === '/api/v3/command')).toHaveLength(1);
});

for (const pending of [false, true]) {
test(`unparseable ${pending ? 'pending ' : ''}filenames can be reviewed with explicit quality and multiple languages`, async ({ page, mutations }) => {
  await mockImport(page, mutations, 200, { status: 'completed' }, pending, 'Unable to parse file');
  const name = 'Dracula (coppola) - 1080p FR EN x264 ac3 mHDgz.mkv';
  const path = `/downloads/example/${name}`;
  await page.route(/\/api\/v3\/qualitydefinition$/, route => route.fulfill({ json: [{ quality: { id: 7, name: 'Bluray-1080p' } }] }));
  await page.route(/\/api\/v3\/manualimport(?:\?|$)/, route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body[0]).toMatchObject({ path, movieId: movie.id, quality: { quality: { id: 7 }, revision: { version: 1, real: 0, isRepack: false } }, languages: [{ id: 2, name: 'French' }, { id: 1, name: 'English' }] });
      mutations.push({ method: 'POST', path: '/api/v3/manualimport', body });
      return route.fulfill({ json: body.map((item: object) => ({ ...item, rejections: [] })) });
    }
    return route.fulfill({ json: [{ ...candidate, movie: undefined, path, relativePath: name, quality: null, languages: [], rejections: [{ reason: 'Unable to parse file' }] }] });
  });
  await page.goto('/downloads');
  if (pending) {
    await expect(page.getByText('Automatic import rejected; manual review is available. Removal remains protected.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Completed download', exact: true })).toBeDisabled();
  }
  await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Manual Import - Completed download', exact: true }).getByText('Unable to parse file', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: `Select ${name}`, exact: true }).check();
  await expect(page.getByRole('button', { name: 'Review Import (1)', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Movie', exact: true }).fill(movie.title);
  await page.getByRole('option', { name: `${movie.title} (${movie.year})`, exact: true }).click();
  await page.getByRole('combobox', { name: 'Quality', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'Bluray-1080p', exact: true }).click();
  await page.getByRole('combobox', { name: 'Languages', exact: true }).locator('..').click();
  await page.getByRole('option', { name: 'French', exact: true }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true });
  await expect(confirmation).toContainText('French, English');
  expect(mutations.some(item => item.path === '/api/v3/command')).toBe(false);
  await confirmation.getByRole('button', { name: 'Confirm Import', exact: true }).click();
  await expect.poll(() => mutations.filter(item => item.path === '/api/v3/command').length).toBe(1);
  const command = mutations.find(item => item.path === '/api/v3/command');
  expect(command?.body).toMatchObject({ name: 'ManualImport', files: [{ path, quality: { quality: { id: 7 } }, languages: [{ id: 2 }, { id: 1 }] }] });
});
}

for (const mediaType of ['movies', 'series']) {
  test(`${mediaType} media suggestions require confirmation and preserve the original filename`, async ({ page, mutations }) => {
    await mockImport(page, mutations);
    const item = mediaType === 'movies' ? { ...movie, title: 'Mad Max 2', year: 1981 } : series;
    const name = mediaType === 'movies' ? '[ OxTorrent.com ] Mad Max 2 -1080p.MULTI.x264 ac3 mHDgz.mkv' : '[ OxTorrent.com ] Example.Series.S01E01.1080p.mkv';
    const path = `/downloads/example/${name}`;
    await page.route(/\/api\/v3\/(movie|series)(?:\?|$)/, route => route.fulfill({ json: [item] }));
    await page.route(/\/api\/v3\/manualimport(?:\?|$)/, route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        expect(body[0]).toMatchObject({ path, quality: candidate.quality, languages: candidate.languages,
          ...(mediaType === 'movies' ? { movieId: item.id } : { seriesId: item.id, episodeIds: [21] }) });
        mutations.push({ method: 'POST', path: '/api/v3/manualimport', body });
        return route.fulfill({ json: body.map((file: object) => ({ ...file, rejections: [] })) });
      }
      return route.fulfill({ json: [{ ...candidate, path, relativePath: name, movie: undefined, series: undefined, episodes: [] }] });
    });
    await page.goto('/downloads');
    if (mediaType === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.getByRole('button', { name: 'Manual import Completed download', exact: true }).click();
    const choice = page.getByRole('button', { name: `Use suggested media ${item.title} (${item.year})`, exact: true });
    await expect(choice).toBeVisible();
    const checkbox = page.getByRole('checkbox', { name: `Select ${name}`, exact: true });
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await expect(page.getByRole('button', { name: 'Review Import (1)', exact: true })).toBeDisabled();
    expect(mutations).toEqual([]);
    await choice.click();
    await expect(choice).toHaveCount(0);
    if (mediaType === 'series') {
      await page.getByRole('combobox', { name: 'Episodes', exact: true }).locator('..').click();
      await page.getByRole('option', { name: 'S1 E1 · Pilot', exact: true }).click();
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: 'Review Import (1)', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Confirm Manual Import', exact: true })).toContainText(name);
    expect(mutations.map(item => item.path)).toEqual(['/api/v3/manualimport']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
