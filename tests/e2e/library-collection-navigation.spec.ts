import { test, expect, movie, series } from './fixtures';
import type { Page } from '@playwright/test';

const saga = { id: 5, tmdbId: 100, title: 'Saga with a different name', movies: [{ tmdbId: 10, title: movie.title, year: 2025, status: 'released' }] };
async function filmLibrary(page: Page, count = 1) {
  const films = Array.from({ length: count }, (_, index) => ({ ...movie, id: index + 1, tmdbId: 10 + index,
    title: `Example movie ${String(index + 1).padStart(2, '0')}`, collection: { tmdbId: 100, title: saga.title } }));
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: films }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [{ ...saga, movies: films.map(item => ({ tmdbId: item.tmdbId, title: item.title, year: item.year, status: 'released' })) }] }));
  return films;
}
test('shares one persistent search across Movies, Series and Collections, including edits and clearing', async ({ page, mutations }) => {
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [
    { ...movie, title: 'Alpha movie' }, { ...movie, id: 2, tmdbId: 11, title: 'Beta movie' },
  ] }));
  await page.route('**/api/v3/series?*', route => route.fulfill({ json: [{ ...series, title: 'Alpha series' }] }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [
    { ...saga, title: 'Alpha saga' }, { ...saga, id: 6, tmdbId: 200, title: 'Beta saga', movies: [{ tmdbId: 11, title: 'Beta movie' }] },
  ] }));
  await page.goto('/library');
  const search = page.getByRole('textbox', { name: 'Search', exact: true });
  await search.fill('Alpha');
  await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await expect(search).toHaveValue('Alpha');
  await expect(page.getByRole('button', { name: 'Open collection Alpha saga', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open collection Beta saga', exact: true })).toHaveCount(0);
  await search.fill('Beta');
  await expect(page.getByRole('button', { name: 'Open collection Beta saga', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
  await expect(search).toHaveValue('Beta');
  await expect(page.getByRole('button', { name: 'Open Beta movie', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Series (0)', exact: true }).click();
  await expect(search).toHaveValue('Beta');
  await expect(page.getByText('No series found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Clear Search', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collections (2)', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open collection Alpha saga', exact: true })).toBeVisible();
  await search.fill('Alpha'); await page.reload();
  await expect(search).toHaveValue('Alpha');
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open collection Alpha saga', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
for (const close of ['button', 'escape']) {
  test(`a linked collection closes with ${close} back to the same movie, page, filters and search`, async ({ page, mutations }) => {
    await filmLibrary(page, 25);
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 700 });
    await page.addInitScript(() => localStorage.setItem('flix.preferences.library.filters', JSON.stringify({ status: 'released', availability: 'existing', sort: 'title' })));
    await page.goto('/library');
    await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Example');
    await page.getByRole('button', { name: 'Go to page 2', exact: true }).click();
    const card = page.getByRole('button', { name: 'Open Example movie 13', exact: true });
    await card.focus();
    const scroll = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Enter');
    const film = page.getByRole('dialog', { name: 'Movie: Example movie 13', exact: true });
    const link = film.getByRole('button', { name: `Collection: ${saga.title}`, exact: true });
    await link.click();
    const collection = page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true });
    await expect(collection).toBeVisible();
    await expect(page).toHaveURL(/media=movies&id=13/);
    await expect(page.getByRole('button', { name: 'Open collection Saga with a different name', exact: true })).toHaveCount(0);
    if (close === 'button') await collection.getByRole('button', { name: 'Close collection', exact: true }).click();
    else await page.keyboard.press('Escape');
    await expect(collection).not.toBeVisible();
    await expect(film).toBeVisible();
    await expect(link).toBeFocused();
    await film.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(card).toBeVisible();
    await expect(card).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
    await expect(page.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('Example');
    await expect(page.getByRole('button', { name: 'Page 2, Current page', exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flix.preferences.library.filters')!).status)).toBe('released');
    expect(mutations).toEqual([]);
  });
}
test('Back closes a linked collection and movie, while Forward restores only the canonical movie sheet', async ({ page, mutations }) => {
  await filmLibrary(page);
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open Example movie 01', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Movie: Example movie 01', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
test('a linked collection reports unavailable data in its sheet and recovers without switching lists', async ({ page, mutations }) => {
  await filmLibrary(page);
  let recovered = false;
  await page.route('**/api/v3/collection?*', route => route.fulfill(recovered ? { json: [saga] } : { status: 503, json: {} }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  await page.getByRole('dialog', { name: 'Collection', exact: true }).getByRole('button', { name: 'Retry Collections', exact: true }).click();
  recovered = true;
  await page.getByRole('dialog', { name: 'Collection', exact: true }).getByRole('button', { name: 'Retry Collections', exact: true }).click();
  const collection = page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true });
  await expect(collection).toBeVisible();
  await collection.getByRole('button', { name: 'Close collection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Movie: Example movie 01', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('closing a loading collection cannot reopen it when its response arrives', async ({ page, mutations }) => {
  await filmLibrary(page);
  let release!: () => void;
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v3/collection?*', async route => {
    await response;
    await route.fulfill({ json: [saga] });
  });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  const collection = page.getByRole('dialog', { name: 'Collection', exact: true });
  await collection.getByRole('button', { name: 'Close collection', exact: true }).click();
  release();
  await expect(page.getByRole('dialog', { name: 'Movie: Example movie 01', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^Collection(?::|$)/ })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
test('a movie opened from a linked collection replaces the current sheet without exposing the collection list', async ({ page, mutations }) => {
  await filmLibrary(page, 2);
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  const collection = page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true });
  await collection.getByRole('button', { name: 'View Example movie 02', exact: true }).click();
  await expect(collection).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Movie: Example movie 02', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/media=movies&id=2/);
  await page.getByRole('dialog', { name: 'Movie: Example movie 02', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Example movie 01', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
test('a missing linked collection stays in an informative sheet and closes back to its movie', async ({ page, mutations }) => {
  await filmLibrary(page);
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  const collection = page.getByRole('dialog', { name: 'Collection', exact: true });
  await expect(collection).toContainText('This collection is not available in the selected instance.');
  await collection.getByRole('button', { name: 'Close collection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Movie: Example movie 01', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/media=movies&id=1/);
  expect(mutations).toEqual([]);
});
test('a linked collection refreshes while the underlying movie remains paused', async ({ page, mutations }) => {
  const films = await filmLibrary(page);
  let collections = 0, movieReads = 0;
  await page.route('**/api/v3/collection/5', route => { collections++; return route.fulfill({ json: saga }); });
  await page.route('**/api/v3/movie/1', route => { movieReads++; return route.fulfill({ json: films[0] }); });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Open Example movie 01', exact: true }).click();
  await page.getByRole('button', { name: `Collection: ${saga.title}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Collection: ${saga.title}`, exact: true })).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => collections).toBe(1);
  expect(movieReads).toBe(0);
  expect(mutations).toEqual([]);
});
