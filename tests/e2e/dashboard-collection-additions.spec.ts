import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';

const saga = { id: 99, name: 'Add saga', parts: [
  { id: 10, title: movie.title, release_date: '2025-01-01' },
  { id: 11, title: 'New sequel', release_date: '2026-01-01' },
  { id: 12, title: 'Future sequel', release_date: '2031-01-01' },
] };
const native = (id: number) => ({ tmdbId: id, title: id === 11 ? 'New sequel' : 'Future sequel', year: id === 11 ? 2026 : 2031, status: id === 11 ? 'released' : 'announced' });
type Mutation = { method: string; path: string; body: unknown };
async function setup(page: Page, mutations: Mutation[], french = false) {
  const state = { library: [{ ...movie }], profiles: true };
  await page.route('**/search/collection?*', route => route.fulfill({ json: { results: [saga], total_pages: 1, total_results: 1 } }));
  await page.route('**/collection/99?*', route => route.fulfill({ json: saga }));
  await page.route('**/api/v3/movie?*', route => {
    const id = new URL(route.request().url()).searchParams.get('tmdbId');
    return route.fulfill({ json: id ? state.library.filter(item => item.tmdbId === Number(id)) : state.library });
  });
  await page.route('**/api/v3/movie/lookup/tmdb?*', route => route.fulfill({ json: native(Number(new URL(route.request().url()).searchParams.get('tmdbId'))) }));
  await page.route(/\/api\/v3\/quality[Pp]rofile\?/, route => route.fulfill(state.profiles
    ? { json: [{ id: 1, name: 'Any' }, { id: 4, name: 'HD' }] } : { status: 503, json: {} }));
  await page.route('**/api/v3/movie', route => {
    const body = route.request().postDataJSON();
    mutations.push({ method: route.request().method(), path: '/api/v3/movie', body });
    const item = { ...movie, ...body, id: body.tmdbId + 100, hasFile: false };
    state.library.push(item);
    return route.fulfill({ status: 201, json: item });
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: french ? 'Rechercher' : 'Search', exact: true }).fill('Saga');
  await page.getByRole('button', { name: /^Collections/ }).click();
  await expect(page.getByRole('button', { name: french ? 'Ouvrir la collection Add saga' : 'Open collection Add saga', exact: true })).toBeVisible();
  return state;
}
async function openMovie(page: Page) {
  await page.getByRole('button', { name: 'Open collection Add saga', exact: true }).click();
  await page.getByRole('button', { name: 'View New sequel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Movie: New sequel', exact: true });
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  return dialog;
}
test('adds one collection film with the chosen quality, no navigation and no duplicate write', async ({ page, mutations }) => {
  await setup(page, mutations);
  const dialog = await openMovie(page);
  await dialog.getByRole('combobox', { name: 'Quality', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  expect(mutations).toEqual([]);
  await dialog.getByRole('button', { name: 'Add', exact: true }).evaluate(button => { (button as HTMLElement).click(); (button as HTMLElement).click(); });
  await expect(dialog).toContainText('This movie is already in your library.');
  expect(mutations).toEqual([{ method: 'POST', path: '/api/v3/movie', body: {
    tmdbId: 11, title: 'New sequel', year: 2026, qualityProfileId: 4, rootFolderPath: '/movies', monitored: true, addOptions: { searchForMovie: true },
  } }]);
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Collection: Add saga', exact: true }).getByRole('button', { name: 'Add movies (1)', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Saga');
});
test('rechecks library membership immediately before an individual add', async ({ page, mutations }) => {
  const state = await setup(page, mutations);
  const dialog = await openMovie(page);
  state.library.push({ ...movie, id: 111, tmdbId: 11, title: 'New sequel' });
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toContainText('This movie is already in your library.');
  expect(mutations).toEqual([]);
});
test('the collection Add action requires film selection, quality and confirmation before writes', async ({ page, mutations }) => {
  await setup(page, mutations);
  await page.getByRole('button', { name: 'Add collection Add saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.getByRole('checkbox', { name: 'Request Example movie', exact: true })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Request Future sequel', exact: true }).uncheck();
  await dialog.getByRole('combobox', { name: 'Quality for new movies', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'HD', exact: true }).click();
  expect(mutations).toEqual([]);
  await dialog.getByRole('button', { name: 'Request downloads', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Download request results', exact: true }).locator('.v-list-item')).toHaveCount(1);
  expect(mutations).toHaveLength(1);
  expect(mutations[0]?.body).toMatchObject({ tmdbId: 11, qualityProfileId: 4, addOptions: { searchForMovie: true } });
  await expect(dialog.getByRole('button', { name: 'Request downloads', exact: true })).toBeDisabled();
});
test('batch adds future films in monitoring only and rechecks films that appeared meanwhile', async ({ page, mutations }) => {
  const state = await setup(page, mutations);
  await page.getByRole('button', { name: 'Add collection Add saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(dialog.getByRole('button', { name: 'Request downloads', exact: true })).toBeEnabled();
  state.library.push({ ...movie, id: 111, tmdbId: 11, title: 'New sequel' });
  await dialog.getByRole('button', { name: 'Request downloads', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Download request results', exact: true }).locator('.v-list-item')).toHaveCount(2);
  expect(mutations).toHaveLength(1);
  expect(mutations[0]?.body).toMatchObject({ tmdbId: 12, monitored: true, minimumAvailability: 'released', addOptions: { searchForMovie: false } });
});
test('cancelling collection confirmation never adds or downloads films', async ({ page, mutations }) => {
  await setup(page, mutations);
  await page.getByRole('button', { name: 'Add collection Add saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Collection: Add saga', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('missing quality profiles block both individual and batch additions', async ({ page, mutations }) => {
  const state = await setup(page, mutations); state.profiles = false;
  await page.getByRole('button', { name: 'Open collection Add saga', exact: true }).click();
  await page.getByRole('button', { name: 'View New sequel', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Movie: New sequel', exact: true });
  await expect(preview.getByRole('button', { name: 'Retry Quality profiles', exact: true })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await preview.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Add movies (2)', exact: true }).click();
  const batch = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(batch.getByRole('button', { name: 'Retry Quality profiles', exact: true })).toBeVisible();
  await expect(batch.getByRole('button', { name: 'Request downloads', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
});
test('a mismatched native identity blocks all additions instead of trusting TMDB metadata', async ({ page, mutations }) => {
  await setup(page, mutations);
  await page.route('**/api/v3/movie/lookup/tmdb?*', route => route.fulfill({ json: { ...native(11), tmdbId: 999 } }));
  await page.getByRole('button', { name: 'Add collection Add saga', exact: true }).click();
  const collection = page.getByRole('dialog', { name: 'Collection: Add saga', exact: true });
  await expect(collection).toContainText('Invalid movie lookup. No movie was added.');
  await expect(page.getByRole('dialog', { name: 'Download missing movies', exact: true })).toHaveCount(0);
  await collection.getByRole('button', { name: 'View New sequel', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Movie: New sequel', exact: true });
  await expect(preview).toContainText('Invalid movie lookup. No movie was added.');
  await expect(preview.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
});
test('a failed individual write cannot be resubmitted before a fresh read-only verification', async ({ page, mutations }) => {
  await setup(page, mutations);
  await page.route('**/api/v3/movie', route => {
    mutations.push({ method: route.request().method(), path: '/api/v3/movie', body: route.request().postDataJSON() });
    return route.fulfill({ status: 502, json: {} });
  });
  const dialog = await openMovie(page);
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dialog).toContainText('Adding failed');
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  expect(mutations).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  expect(mutations).toHaveLength(1);
});
test.describe('French collection additions', () => {
  test.use({ locale: 'fr-FR' });
  test('translates individual and collection add controls without writing before confirmation', async ({ page, mutations }) => {
    await setup(page, mutations, true);
    await page.getByRole('button', { name: 'Ajouter la collection Add saga', exact: true }).click();
    const batch = page.getByRole('dialog', { name: 'Télécharger les films manquants', exact: true });
    await expect(batch.getByRole('button', { name: 'Demander les téléchargements', exact: true })).toBeEnabled();
    await expect(batch.getByRole('checkbox', { name: 'Demander New sequel', exact: true })).toBeChecked();
    await batch.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Voir New sequel', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Film: New sequel', exact: true });
    await expect(preview.getByRole('button', { name: 'Ajouter', exact: true })).toBeEnabled();
    await expect(preview.getByRole('combobox', { name: 'Qualité', exact: true })).toBeVisible();
    expect(mutations).toEqual([]);
  });
});
