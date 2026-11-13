import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';

const saga = { id: 99, name: 'Example saga', overview: 'A complete collection overview', poster_path: '/collection.jpg' };
const parts = [{ id: 10, title: movie.title, release_date: '2025-01-01', poster_path: '/movie.jpg' }, { id: 11, title: 'Missing sequel', release_date: '2026-01-01', poster_path: '/movie.jpg' }];
test.beforeEach(async ({ page }) => {
  await page.route('https://image.tmdb.org/**', route => route.fulfill({ contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#313d47"/></svg>' }));
});
async function search(page: Page) {
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await page.getByRole('button', { name: /^Collections/ }).click();
}
test('searches catalog collections lazily, opens members with library badges and returns to explicit movie search', async ({ page, mutations }) => {
  const queries: URL[] = [];
  await page.route('**/search/collection?*', route => {
    queries.push(new URL(route.request().url()));
    return route.fulfill({ json: { results: [saga], total_pages: 1, total_results: 1 } });
  });
  await page.route('**/collection/99?*', route => route.fulfill({ json: { ...saga, parts } }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
  await expect(page.getByRole('button', { name: 'Details for Example movie', exact: true })).toBeVisible();
  expect(queries).toHaveLength(0);
  await page.getByRole('button', { name: /^Collections/ }).click();
  await page.getByRole('button', { name: 'Open collection Example saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  const first = dialog.getByRole('button', { name: 'View Example movie', exact: true });
  await expect(first).toContainText('Existing');
  await expect(dialog.getByRole('button', { name: 'View Missing sequel', exact: true })).toContainText('Missing');
  await expect.poll(() => dialog.evaluate(el => el.getAnimations({ subtree: true }).filter(animation =>
    animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)).length)).toBe(0);
  await page.screenshot({ path: `/tmp/flix-dashboard-collection-${test.info().project.name}.png`, fullPage: true });
  expect(queries).toHaveLength(1);
  expect(queries[0]?.searchParams.get('query')).toBe('Example');
  expect(queries[0]?.searchParams.get('include_adult')).toBe('false');
  await first.click();
  const preview = page.getByRole('dialog', { name: 'Movie: Example movie', exact: true });
  await expect(preview.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await preview.getByRole('button', { name: 'Search this movie', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('tmdb:10');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Details for Example movie', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('keeps collection pages and search when switching tabs and restores focus after closing', async ({ page, mutations }) => {
  const pages: string[] = [];
  await page.route('**/search/collection?*', route => {
    const current = new URL(route.request().url()).searchParams.get('page')!; pages.push(current);
    return route.fulfill({ json: { results: [{ ...saga, name: `Saga page ${current}` }], total_pages: 3, total_results: 41 } });
  });
  await page.route('**/collection/99?*', route => route.fulfill({ json: { ...saga, name: 'Saga page 2', parts } }));
  await search(page);
  await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  const card = page.getByRole('button', { name: 'Open collection Saga page 2', exact: true });
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: /^Series/ }).click();
  await page.getByRole('button', { name: /^Collections/ }).click();
  await expect(card).toBeVisible();
  expect(pages).toEqual(['1', '2']);
  await card.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Collection: Saga page 2', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
  expect(mutations).toEqual([]);
});
test('shows retryable search and detail errors instead of empty success, and preserves cards', async ({ page, mutations }) => {
  let failure = true; let invalidDetail = true;
  await page.route('**/search/collection?*', route => route.fulfill(failure
    ? { status: 503, json: {} } : { json: { results: [saga], total_pages: 1, total_results: 1 } }));
  await page.route('**/collection/99?*', route => route.fulfill({ json: invalidDetail ? { ...saga, id: 100, parts } : { ...saga, parts } }));
  await search(page);
  await expect(page.getByText('Unable to load collections from TMDB.', { exact: false })).toBeVisible();
  await expect(page.getByText('No collections match your search', { exact: true })).toHaveCount(0);
  failure = false;
  await page.getByRole('button', { name: 'Retry Collections', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Example saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  await expect(dialog).toContainText('Invalid collection response from TMDB.');
  await expect(dialog.getByRole('button', { name: /^View / })).toHaveCount(0);
  invalidDetail = false;
  await dialog.getByRole('button', { name: 'Retry Collections', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'View Missing sequel', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('clearing a pending collection query discards its response without an empty-state flash', async ({ page, mutations }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/search/collection?*', async route => { started = true; await pending; await route.fulfill({ json: { results: [saga], total_pages: 1, total_results: 1 } }); });
  try {
    await search(page);
    await expect.poll(() => started).toBe(true);
    await expect(page.getByRole('region', { name: 'Collection results', exact: true })).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByText('No collections match your search', { exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill('');
    release();
    await expect(page.getByText('Enter at least 3 characters to search for collections.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open collection Example saga', exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  } finally { release(); }
});
test('unavailable library data leaves file availability unknown until a successful retry', async ({ page, mutations }) => {
  let unavailable = true;
  await page.route('**/search/collection?*', route => route.fulfill({ json: { results: [saga], total_pages: 1, total_results: 1 } }));
  await page.route('**/collection/99?*', route => route.fulfill({ json: { ...saga, parts } }));
  await page.route('**/api/v3/movie?*', route => route.fulfill(unavailable ? { status: 503, json: {} } : { json: [movie] }));
  await search(page);
  await page.getByRole('button', { name: 'Open collection Example saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Collection: Example saga', exact: true });
  const first = dialog.getByRole('button', { name: 'View Example movie', exact: true });
  await expect(first).toContainText('Unknown');
  await expect(dialog).toContainText('Unable to load movie library.');
  await expect(first).not.toContainText('Missing');
  unavailable = false;
  await dialog.getByRole('button', { name: 'Retry Movie library', exact: true }).click();
  await expect(first).toContainText('Existing');
  expect(mutations).toEqual([]);
});
test('switching instances discards a delayed collection detail without leaking its members', async ({ page, mutations }) => {
  await page.route('**/instances', route => route.fulfill({ json: ['First instance', 'Second instance'].map(name => ({ name,
    radarr: { base_url: 'http://radarr.test', api_key: name, root_folder_path: '/movies' },
    sonarr: { base_url: 'http://sonarr.test', api_key: name, root_folder_path: '/tv' } })) }));
  await page.route('**/search/collection?*', route => route.fulfill({ json: { results: [saga], total_pages: 1, total_results: 1 } }));
  let release!: () => void; let started = false;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/collection/99?*', async route => { started = true; await pending; await route.fulfill({ json: { ...saga, parts } }); });
  try {
    await search(page);
    await page.getByRole('button', { name: 'Open collection Example saga', exact: true }).click();
    await expect.poll(() => started).toBe(true);
    await page.getByRole('dialog').getByRole('button', { name: 'Close collection', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.getByRole('combobox', { name: 'Instance', exact: true }).press('Enter');
    await page.getByRole('option', { name: 'Second instance', exact: true }).click();
    release();
    await expect(page.getByRole('button', { name: 'Open collection Example saga', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View Example movie', exact: true })).toHaveCount(0);
    expect(mutations).toEqual([]);
  } finally { release(); }
});
test.describe('French catalog collections', () => {
  test.use({ locale: 'fr-FR' });
  test('translates the search and keeps the three media controls inside the viewport', async ({ page, mutations }) => {
    const requests: URL[] = [];
    await page.route('**/search/collection?*', route => { requests.push(new URL(route.request().url())); return route.fulfill({ json: { results: [], total_pages: 0, total_results: 0 } }); });
    await page.goto('/dashboard');
    await page.getByRole('textbox', { name: 'Rechercher', exact: true }).fill('Astérix & amis');
    await page.getByRole('button', { name: /^Collections/ }).click();
    await expect(page.getByText('Aucune collection ne correspond à la recherche', { exact: true })).toBeVisible();
    expect(requests[0]?.searchParams.get('query')).toBe('Astérix & amis');
    for (const width of [320, 393, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(mutations).toEqual([]);
  });
});
