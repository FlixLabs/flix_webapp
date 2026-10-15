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

test('sign-in verifies the session on the API without fetching encrypted credentials', async ({ page, mutations }) => {
  await page.addInitScript(() => sessionStorage.removeItem('flix_webapp_is_authenticated'));
  const methods: string[] = [];
  await page.route('**/session', route => {
    methods.push(route.request().method());
    return route.fulfill(route.request().method() === 'POST'
      ? { status: 401, json: { error: 'Wrong username or password.' } }
      : { json: { enabled: true, authenticated: false } });
  });
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('wrong-user');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByText('Wrong username or password.', { exact: true })).toBeVisible();
  expect(methods).toEqual(['GET', 'POST']);
  expect(mutations).toEqual([]);
});
