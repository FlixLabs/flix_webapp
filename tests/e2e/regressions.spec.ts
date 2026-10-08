import { test, expect, releaseTitle } from './fixtures';

test('theme changes persist after reload', async ({ page, mutations }) => {
  await page.goto('/settings');
  await expect(page.locator('.v-application')).toHaveClass(/v-theme--flixDark/);
  await page.getByRole('combobox', { name: 'Theme', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Light', exact: true }).click();
  await expect(page.locator('.v-application')).toHaveClass(/v-theme--flixLight/);
  await page.reload();
  await expect(page.locator('.v-application')).toHaveClass(/v-theme--flixLight/);
  expect(mutations).toEqual([]);
});

test('a movie release requires explicit confirmation', async ({ page, mutations }) => {
  await page.goto('/library');
  await page.locator('.media-card').filter({ hasText: 'Example movie' }).click();
  await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
  await page.getByRole('button', { name: `Choose ${releaseTitle}`, exact: true }).click();
  expect(mutations).toEqual([]);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]).toEqual({ method: 'POST', path: '/api/v3/release', body: { guid: 'selected', indexerId: 7, movieId: 1 } });
});

test('changing a series season searches again without downloading', async ({ page, mutations }) => {
  const searches: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/v3/release?')) searches.push(request.url()); });
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series', exact: true }).click();
  await page.locator('.media-card').filter({ hasText: 'Example series' }).click();
  await page.getByRole('button', { name: 'Choose Release', exact: true }).click();
  await expect.poll(() => searches.some(url => url.includes('seasonNumber=1'))).toBe(true);
  await page.getByRole('combobox', { name: 'Season', exact: true }).press('Enter');
  await page.getByRole('option', { name: 'Season 2', exact: true }).click();
  await expect.poll(() => searches.some(url => url.includes('seasonNumber=2'))).toBe(true);
  expect(mutations).toEqual([]);
});

test('download deletion can be cancelled and only deletes the queue item', async ({ page, mutations }) => {
  await page.goto('/downloads');
  await page.getByRole('button', { name: 'Remove Download example', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(mutations).toEqual([]);
  await page.getByRole('button', { name: 'Remove Download example', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(() => mutations.length).toBe(1);
  expect(mutations[0]?.method).toBe('DELETE');
  expect(mutations[0]?.path).toBe('/api/v3/queue/101');
});

test('calendar overflow opens all event titles', async ({ page, mutations }) => {
  await page.goto('/calendar');
  await page.getByText(/\d+ more/).first().click();
  const dialog = page.locator('.v-dialog');
  await expect(dialog.getByText('Calendar movie 7 with a long title (Digital)', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('library stays within the viewport in both themes', async ({ page, mutations }) => {
  for (const theme of ['flixDark', 'flixLight']) {
    await page.goto('/settings');
    await page.evaluate(value => localStorage.setItem('flix_theme', value), theme);
    await page.goto('/library');
    await expect(page.locator('.media-card')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(mutations).toEqual([]);
});
