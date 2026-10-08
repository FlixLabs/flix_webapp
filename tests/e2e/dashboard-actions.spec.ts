import { test, expect, movie } from './fixtures';

test('dashboard adds and removes a movie without reloading the results', async ({ page, mutations }) => {
  const lookup = { ...movie, id: 0, tmdbId: 30, title: 'New movie' };
  let finishAdd!: () => void;
  let finishDelete!: () => void;
  const reads: string[] = [];
  page.on('request', request => {
    if (request.method() === 'GET' && /\/api\/v3\/movie(?:\?|\/lookup\?)/.test(request.url())) reads.push(request.url());
  });
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [lookup] }));
  await page.route(/\/api\/v3\/movie(?:\/42\?deleteFiles=true)?$/, async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fallback();
    mutations.push({ method: request.method(), path: new URL(request.url()).pathname, body: request.postDataJSON() });
    if (request.method() === 'POST') {
      await new Promise<void>(resolve => { finishAdd = resolve; });
      await route.fulfill({ json: { ...lookup, id: 42 } });
    } else {
      await new Promise<void>(resolve => { finishDelete = resolve; });
      await route.fulfill({ status: 204 });
    }
  });
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New movie');
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'New movie' });
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  await expect.poll(() => reads.length).toBe(2);
  const initialReads = [...reads];
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(row.locator('button.v-btn--loading')).toBeDisabled();
  await expect.poll(() => mutations.length).toBe(1);
  finishAdd();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toBeEnabled();
  expect(reads).toEqual(initialReads);
  await row.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(row.locator('button.v-btn--loading')).toBeDisabled();
  await expect.poll(() => mutations.length).toBe(2);
  finishDelete();
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  expect(reads).toEqual(initialReads);
  expect(mutations.map(mutation => [mutation.method, mutation.path])).toEqual([
    ['POST', '/api/v3/movie'], ['DELETE', '/api/v3/movie/42'],
  ]);
});

test('failed dashboard additions keep Add available and display an error', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [{ ...movie, tmdbId: 30, title: 'New movie' }] }));
  await page.route(/\/api\/v3\/movie$/, route => route.request().method() === 'POST'
    ? route.fulfill({ status: 500, json: {} }) : route.fallback());
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('New movie');
  const row = page.locator('.custom-list .v-list-item').filter({ hasText: 'New movie' });
  await row.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Adding failed', { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
