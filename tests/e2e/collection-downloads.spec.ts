import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';
import { closeWithoutCollapsing } from './dialog-transition';

const existing = { ...movie, title: 'The Return of the Tall Blond Man with One Black Shoe', hasFile: false, movieFile: undefined };
const available = { ...movie, id: 12, tmdbId: 12, title: 'Available film' };
const newMovie = { tmdbId: 11, title: 'New film', year: 2004, status: 'released' };
const saga = { id: 1, tmdbId: 100, title: 'Download saga', movies: [
  { tmdbId: existing.tmdbId, title: existing.title, status: 'released' }, newMovie,
  { tmdbId: 12, title: available.title, status: 'released' },
  { tmdbId: 13, title: 'Future film', status: 'announced' },
  { tmdbId: 14, title: 'Unknown film' },
] };
async function open(page: Page, fileAppeared = false) {
  await page.route('**/api/v3/movie?*', route => {
    const id = new URL(route.request().url()).searchParams.get('tmdbId');
    return route.fulfill({ json: ['11', '13'].includes(id ?? '') ? [] : id === '10'
      ? [{ ...existing, hasFile: fileAppeared }] : [existing, available] });
  });
  await page.route('**/api/v3/movie/lookup/tmdb?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('tmdbId') === '13' ? saga.movies[3] : newMovie }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Download saga', exact: true }).click();
  await page.getByRole('button', { name: 'Download missing (3)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('collection downloads require selection, quality and confirmation before any writes', async ({ page, mutations }) => {
  const dialog = await open(page);
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  await expect(dialog.getByRole('checkbox', { name: 'Request New film', exact: true })).toBeChecked();
  expect(mutations).toEqual([]);
  const confirm = dialog.getByRole('button', { name: 'Request downloads', exact: true });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog.getByRole('list', { name: 'Download request results' }).locator('.v-list-item')).toHaveCount(3);
  expect(mutations).toHaveLength(3);
  expect(mutations.find(request => request.path === '/api/v3/command')).toMatchObject({ method: 'POST', body: { name: 'MoviesSearch', movieIds: [existing.id] } });
  expect(mutations.find(request => request.path === '/api/v3/movie')).toMatchObject({ method: 'POST', body: { tmdbId: 11, qualityProfileId: 1, rootFolderPath: '/movies', addOptions: { searchForMovie: true } } });
  expect(mutations.find(request => request.path === '/api/v3/movie' && (request.body as { tmdbId?: number }).tmdbId === 13)).toMatchObject({ method: 'POST', body: { tmdbId: 13, monitored: true, minimumAvailability: 'released', addOptions: { searchForMovie: false } } });
  await expect(dialog.getByText('Added to Radarr and monitored for release. No immediate search requested.', { exact: true })).toBeVisible();
  await expect(confirm).toBeDisabled();
  const selectionTitle = dialog.getByRole('list', { name: 'Missing movies', exact: true }).locator('.v-list-item-title').first();
  const resultTitle = dialog.getByRole('list', { name: 'Download request results', exact: true }).locator('.v-list-item-title').first();
  const selectedBox = await selectionTitle.boundingBox();
  const resultBox = await resultTitle.boundingBox();
  expect(Math.abs(selectedBox!.x - resultBox!.x)).toBeLessThanOrEqual(1);
  for (const list of [dialog.getByRole('list', { name: 'Missing movies', exact: true }), dialog.getByRole('list', { name: 'Download request results', exact: true })]) {
    const clipped = await list.locator('.v-list-item-title, .v-list-item-subtitle').evaluateAll(nodes => nodes.some(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1));
    expect(clipped).toBe(false);
  }
});

test('closing the collection confirmation never requests a download', async ({ page, mutations }) => {
  const dialog = await open(page);
  await closeWithoutCollapsing(dialog);
  await expect(page.getByRole('button', { name: 'Download missing (3)', exact: true })).toBeFocused();
  expect(mutations).toEqual([]);
});

test('existing-only selection keeps its profile and skips a file that appeared meanwhile', async ({ page, mutations }) => {
  const dialog = await open(page, true);
  await dialog.getByRole('checkbox', { name: 'Request New film', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Request Future film', exact: true }).uncheck();
  await expect(dialog.getByRole('combobox', { name: 'Quality for new movies' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Request downloads', exact: true }).click();
  await expect(dialog.getByText('Already available or availability could not be confirmed.', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('profile failures block adding films but do not block an existing-only search', async ({ page, mutations }) => {
  await page.route('**/api/v3/qualityProfile?*', route => route.fulfill({ status: 503, json: {} }));
  const dialog = await open(page);
  await expect(dialog.getByRole('button', { name: 'Retry Quality profiles', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Request downloads', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
  await dialog.getByRole('checkbox', { name: 'Request New film', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Request Future film', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Request downloads', exact: true }).click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toMatchObject({ path: '/api/v3/command' });
});
