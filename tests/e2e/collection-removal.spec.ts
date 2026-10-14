import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';

const second = { ...movie, id: 2, tmdbId: 11, title: 'Second film', hasFile: false, movieFile: undefined };
const saga = { id: 5, tmdbId: 100, title: 'Removal saga', movies: [
  { tmdbId: movie.tmdbId, title: movie.title, status: 'released' },
  { tmdbId: second.tmdbId, title: second.title, status: 'released' },
  { tmdbId: 12, title: 'Absent film', status: 'released' },
] };
async function open(page: Page, deletes: { id: number; deleteFiles: string | null }[], failSecond = false) {
  const removed = new Set<number>();
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [movie, second].filter(item => !removed.has(item.id)) }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.route('**/api/v3/collection/5', route => route.fulfill({ json: saga }));
  await page.route('**/api/v3/movie/*', route => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split('/').at(-1));
    if (route.request().method() === 'DELETE') {
      deletes.push({ id, deleteFiles: url.searchParams.get('deleteFiles') });
      if (failSecond && id === 2) return route.fulfill({ status: 500, json: {} });
      removed.add(id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { ...(id === 1 ? movie : second), collection: { tmdbId: 100 } } });
  });
  await page.goto('/library');
  await expect(page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).locator('.v-chip')).toHaveText(['Existing', 'Released']);
  const movieColors = await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).locator('.v-chip').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Removal saga', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Collection: Removal saga', exact: true });
  const member = parent.getByRole('button', { name: `View ${movie.title}`, exact: true });
  await expect(member.locator('.media-card-tags .v-chip')).toHaveText(['Existing', 'Released']);
  const colors = await member.locator('.v-chip').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  expect(colors).toEqual(movieColors);
  const missing = parent.getByRole('button', { name: `View ${second.title}`, exact: true });
  await expect(missing.locator('.media-card-tags .v-chip')).toHaveText(['Missing', 'Released']);
  const absent = parent.getByRole('button', { name: 'View Absent film', exact: true });
  await expect(absent.locator('.media-card-tags .v-chip')).toHaveText(['Missing', 'Released']);
  await parent.getByRole('button', { name: 'Remove movies (2)', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove collection movies', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('collection removal needs confirmation, excludes absent films and keeps files by default', async ({ page, mutations }) => {
  const deletes: { id: number; deleteFiles: string | null }[] = [];
  const dialog = await open(page, deletes);
  await expect(dialog.getByRole('checkbox', { name: 'Also delete movie files from disk', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Remove Absent film', exact: true })).toHaveCount(0);
  expect(deletes).toEqual([]);
  await dialog.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Removal results' }).locator('.v-list-item')).toHaveCount(2);
  expect(deletes).toEqual([{ id: 1, deleteFiles: 'false' }, { id: 2, deleteFiles: 'false' }]);
  await expect(dialog.getByRole('button', { name: 'Remove selected (2)', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Collections (0)', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collections (0)', exact: true })).toBeFocused();
  expect(mutations).toEqual([]);
});

test('file deletion requires an explicit choice and only selected movies are removed', async ({ page, mutations }) => {
  const deletes: { id: number; deleteFiles: string | null }[] = [];
  const dialog = await open(page, deletes);
  await dialog.getByRole('checkbox', { name: 'Remove Second film', exact: true }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Also delete movie files from disk', exact: true }).check();
  await expect(dialog.getByText('This cannot be undone in Flix.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove selected (1)', exact: true }).click();
  await expect(dialog.getByRole('list', { name: 'Removal results' }).locator('.v-list-item')).toHaveCount(1);
  expect(deletes).toEqual([{ id: 1, deleteFiles: 'true' }]);
  expect(mutations).toEqual([]);
});

test('cancelling collection removal never deletes anything and returns focus', async ({ page, mutations }) => {
  const deletes: { id: number; deleteFiles: string | null }[] = [];
  const dialog = await open(page, deletes);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove movies (2)', exact: true })).toBeFocused();
  expect(deletes).toEqual([]);
  expect(mutations).toEqual([]);
});

test('partial failures keep their results visible without repeating deletion requests', async ({ page, mutations }) => {
  const deletes: { id: number; deleteFiles: string | null }[] = [];
  const dialog = await open(page, deletes, true);
  await dialog.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
  await expect(dialog.getByText('Removal not confirmed.', { exact: false })).toBeVisible();
  await expect(dialog.getByText('Removed from library; files kept.', { exact: true })).toBeVisible();
  expect(deletes).toHaveLength(2);
  await expect(dialog.getByRole('button', { name: 'Remove selected (2)', exact: true })).toBeDisabled();
  expect(mutations).toEqual([]);
});
