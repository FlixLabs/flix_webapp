import { test, expect } from './fixtures';

test('loads route modules only when visited and reuses them on return', async ({ page, mutations }) => {
  const views: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/\/src\/views\/[^/]+\.vue$/.test(path)) views.push(path);
  });
  await page.goto('/library');
  await expect(page.locator('.media-card').first()).toBeVisible();
  expect(views).toEqual(['/src/views/LibraryView.vue']);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toBeVisible();
  expect(views).toEqual(['/src/views/LibraryView.vue', '/src/views/SettingsView.vue']);
  await page.goBack();
  await expect(page.locator('.media-card').first()).toBeVisible();
  expect(views).toHaveLength(2);
  expect(mutations).toEqual([]);
});

test('shares authentication bootstrap without reusing it for sign in', async ({ page, mutations }) => {
  await page.addInitScript(() => sessionStorage.removeItem('flix_webapp_is_authenticated'));
  let requests = 0;
  let release!: () => void;
  const bootstrap = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/auth', async route => {
    requests++;
    await bootstrap;
    await route.fulfill({ json: { username: 'test-user', password: 'encrypted-test-only' } });
  });
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  expect(requests).toBe(1);
  release();
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('wrong-user');
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByText('Wrong Username or Password', { exact: true })).toBeVisible();
  expect(requests).toBe(2);
  expect(mutations).toEqual([]);
});
