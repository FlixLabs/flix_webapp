import { test, expect, movie } from './fixtures';

const saga = { id: 5, tmdbId: 100, title: 'Refreshing saga', movies: Array.from({ length: 14 }, (_, index) => ({
  tmdbId: 10 + index, title: index === 0 ? movie.title : `Film ${index}`, year: 2000 + index, status: 'released',
})) };

test('collection refresh preserves its member page and scroll while updating shared library badges', async ({ page, isMobile, mutations }) => {
  let updated = false, reads = 0;
  const targetIndex = isMobile ? 4 : 8;
  const target = { ...movie, id: 50, tmdbId: 10 + targetIndex, title: `Film ${targetIndex}` };
  await page.route(/\/api\/v3\/movie(?:\?|$)/, route => route.fulfill({ json: updated ? [movie, target] : [movie] }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.route('**/api/v3/collection/5', route => { reads++; return route.fulfill({ json: saga }); });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Refreshing saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Collection: Refreshing saga', exact: true });
  await dialog.getByRole('button', { name: 'Go to page 2', exact: true }).click();
  const card = dialog.getByRole('button', { name: `View ${target.title}`, exact: true });
  await dialog.evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(card).toContainText('Missing');
  const scroll = await dialog.locator('.dialog-flex-text').evaluate(el => el.scrollTop);
  updated = true;
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(card).toContainText('Existing');
  await expect(dialog.getByRole('button', { name: 'Download missing (12)', exact: true })).toBeVisible();
  expect(await dialog.locator('.dialog-flex-text').evaluate(el => el.scrollTop)).toBeGreaterThanOrEqual(scroll - 1);
  expect(reads).toBe(1);
  await dialog.getByRole('button', { name: 'Close collection', exact: true }).click();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(150);
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Movies (2)', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open ${target.title}`, exact: true })).toContainText('Existing');
  expect(mutations).toEqual([]);
});

test('collection updates pause inside missing-film confirmation', async ({ page, mutations }) => {
  let reads = 0;
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.route('**/api/v3/collection/5', route => { reads++; return route.fulfill({ json: saga }); });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Refreshing saga', exact: true }).click();
  const parent = page.getByRole('dialog', { name: 'Collection: Refreshing saga', exact: true });
  await parent.getByRole('button', { name: 'Download missing (13)', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Download missing movies', exact: true });
  await expect(confirmation).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(150);
  expect(reads).toBe(0);
  await confirmation.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(confirmation).not.toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => reads).toBe(1);
  expect(mutations).toEqual([]);
});

test('failed collection updates retain cards and allow a retry without partial membership changes', async ({ page, mutations }) => {
  let fail = true;
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.route('**/api/v3/collection/5', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: saga }));
  await page.route(/\/api\/v3\/movie(?:\?|$)/, route => route.fulfill({ json: [movie] }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Collections (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Open collection Refreshing saga', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Collection: Refreshing saga', exact: true });
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  await expect(dialog.getByRole('button', { name: 'Retry Collection updates', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Download missing (13)', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: `View ${movie.title}`, exact: true })).toBeAttached();
  fail = false;
  await dialog.getByRole('button', { name: 'Retry Collection updates', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Download missing (13)', exact: true })).toBeEnabled();
  expect(mutations).toEqual([]);
});
