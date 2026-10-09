import { test, expect } from './fixtures';

for (const [path, endpoint] of [
  ['/library', '/api/v3/movie'],
  ['/downloads', '/api/v3/queue'],
  ['/calendar', '/api/v3/calendar'],
  ['/system', '/api/v3/diskspace'],
  ['/settings', '/auth'],
]) {
  test(`${path} reports invalid service data without a runtime error`, async ({ page, mutations }) => {
    await page.route(url => url.pathname.replace(/^\/flix-api/, '') === endpoint, route => route.fulfill({ json: null }));
    await page.goto(path!);
    await expect(page.locator('.v-alert').filter({ hasText: 'Invalid service response' }).first()).toBeVisible();
    expect(mutations).toEqual([]);
  });
}

test('downloads accepts history records with no optional languages', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/history\?/, route => route.fulfill({ json: {
    records: [{ id: 10, sourceTitle: 'Imported example', date: '2026-10-09', eventType: 'downloadFolderImported' }],
  } }));
  await page.goto('/downloads');
  await page.getByRole('button', { name: /History/ }).click();
  await expect(page.getByText('Imported example', { exact: true }).first()).toBeVisible();
  expect(mutations).toEqual([]);
});
