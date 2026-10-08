import { test, expect, movie } from './fixtures';

test('dashboard actions keep space from the right card edge', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\/lookup\?/, route => route.fulfill({ json: [
    movie, { ...movie, id: 0, tmdbId: 30, title: 'New movie' },
  ] }));
  await page.goto('/dashboard');
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('movie');
  await expect(page.locator('.custom-list').getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  for (const action of ['Add', 'Remove']) {
    const button = page.locator('.custom-list').getByRole('button', { name: action, exact: true });
    await expect(button).toBeVisible();
    const bounds = (await button.boundingBox())!;
    const card = (await button.locator('xpath=ancestor::*[contains(@class,"spacing-list-item")]').boundingBox())!;
    expect(card.x + card.width - bounds.x - bounds.width).toBeGreaterThanOrEqual(12);
  }
  expect(mutations).toEqual([]);
});

test('sign out follows saved authentication settings, not the API mode', async ({ page, mutations }) => {
  await page.goto('/settings');
  const navigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  await navigation.click();
  await expect(page.getByText('Sign Out', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Security', exact: true }).click();
  await page.getByLabel('Basic authentication', { exact: true }).check();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('test');
  await page.getByLabel('Password', { exact: true }).fill('test-only');
  await navigation.click();
  await expect(page.getByText('Sign Out', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await navigation.click();
  await expect(page.getByText('Sign Out', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click();
  await page.getByLabel('Basic authentication', { exact: true }).uncheck();
  await navigation.click();
  await expect(page.getByText('Sign Out', { exact: true })).toHaveCount(0);
  expect(mutations.map(item => [item.method, item.path])).toEqual([['POST', '/auth'], ['DELETE', '/auth']]);
});

test('sign out is available when authentication is already configured', async ({ page, mutations }) => {
  await page.route('**/auth', route => route.fulfill({ json: { username: 'test', password: 'test-only' } }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByText('Sign Out', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
