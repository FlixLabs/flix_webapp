import { test, expect } from './fixtures';

test('one Flix login survives reloads, authorizes client requests and signs out on the API', async ({ page, mutations }) => {
  await page.addInitScript(() => sessionStorage.removeItem('flix_webapp_is_authenticated'));
  const token = 'd'.repeat(64);
  let revoked = false;
  let signedOut = false;
  const authorized = (route: import('@playwright/test').Route) => !revoked && route.request().headers().authorization === `Bearer ${token}`;
  await page.route('**/auth', route => route.fulfill({ json: { enabled: true, username: 'User' } }));
  await page.route('**/session', async route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ username: 'User', password: 'test-password' });
      return route.fulfill({ json: { enabled: true, authenticated: true, token, expiresIn: 2592000 } });
    }
    if (route.request().method() === 'DELETE') {
      expect(authorized(route)).toBe(true); revoked = true; signedOut = true;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { enabled: true, authenticated: authorized(route) } });
  });
  await page.route('**/instances', route => {
    if (!authorized(route)) return route.fulfill({ status: 401, json: { error: 'Sign in to Flix.' } });
    return route.fulfill({ json: [{ name: 'Test instance', has_download_clients: true,
      radarr: { base_url: 'http://radarr.test', api_key: 'test-only', root_folder_path: '/movies' },
      sonarr: { base_url: 'http://sonarr.test', api_key: 'test-only', root_folder_path: '/tv' } }] });
  });
  let clientReads = 0;
  await page.route('**/download-clients/**', route => {
    expect(authorized(route)).toBe(true); clientReads++;
    return route.fulfill({ json: { clients: [] } });
  });
  await page.goto('/downloads');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('User');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/downloads$/);
  const clients = page.getByRole('button', { name: 'Download clients', exact: true });
  await clients.click();
  await expect.poll(() => clientReads).toBe(1);
  await expect(page.getByLabel('Download clients access token', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(/\/downloads$/);
  await clients.click();
  await expect.poll(() => clientReads).toBe(2);
  await page.getByRole('dialog', { name: 'Download clients', exact: true }).getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByText('Sign Out', { exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(signedOut).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('flix-session:')))).toEqual([]);
  expect(mutations).toEqual([]);
});
