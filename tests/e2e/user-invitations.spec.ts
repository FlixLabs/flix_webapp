import { test, expect } from './fixtures';

const token = 'e'.repeat(64);
const user = { id: 'guest-id', email: 'guest@example.test', name: 'Guest', role: 'user', language: 'en' };

test('invitation acceptance removes the secret from the URL and opens a restricted account', async ({ page, mutations }) => {
  const privateReads: string[] = [];
  page.on('request', request => {
    if (/\/instances$|\/admin\/|radarr\.test|sonarr\.test/.test(request.url())) privateReads.push(request.url());
  });
  await page.route('**/accounts/accept', route => {
    expect(route.request().postDataJSON()).toEqual({ token, name: 'Guest', password: 'my-long-guest-password' });
    return route.fulfill({ json: { enabled: true, authenticated: true, role: 'user', user, token, expiresIn: 86400 } });
  });
  await page.route('**/session', route => route.fulfill({ json: { enabled: true, authenticated: true, role: 'user', user } }));
  await page.route('**/accounts/me', route => route.fulfill({ json: user }));
  await page.route('**/auth', route => route.fulfill({ json: { enabled: true } }));
  await page.goto(`/join#${token}`);
  await expect(page).toHaveURL(/\/join$/);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Guest');
  await page.getByLabel('Password', { exact: true }).fill('my-long-guest-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByText('Sign Out', { exact: true })).toBeVisible();
  await expect(page.getByText('System', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Downloads', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Instance', exact: true })).toHaveCount(0);
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/library');
  await expect(page).toHaveURL(/\/account$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  expect(privateReads).toEqual([]);
  expect(mutations).toEqual([]);
});

test('administrator queues invitations and revokes account access from the same page', async ({ page, mutations }) => {
  let invited = false;
  let disabled = false;
  await page.route('**/admin/accounts', route => route.fulfill({ json: {
    mailConfigured: true, users: [{ ...user, disabled }],
    invitations: invited ? [{ id: 'invitation-id', email: 'new@example.test', delivery: 'queued', expiresAt: Date.now() + 86400000, revoked: false }] : [],
  } }));
  await page.route('**/admin/accounts/invitations', route => {
    expect(route.request().postDataJSON()).toEqual({ email: 'new@example.test', language: 'en' });
    invited = true;
    return route.fulfill({ status: 202, json: { id: 'invitation-id', delivery: 'queued' } });
  });
  await page.route('**/admin/accounts/users/guest-id', route => {
    expect(route.request().postDataJSON()).toEqual({ disabled: true });
    disabled = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/users');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new@example.test');
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(page.getByText('Invitation queued for delivery.', { exact: true })).toBeVisible();
  await expect(page.getByText('new@example.test', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke access', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enable access', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('expired invitations keep the form visible with a useful error and no session', async ({ page, mutations }) => {
  await page.route('**/accounts/accept', route => route.fulfill({ status: 410, json: { error: 'Invitation expired or already used.' } }));
  await page.goto(`/join#${token}`);
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Guest');
  await page.getByLabel('Password', { exact: true }).fill('my-long-guest-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByText('Invitation expired or already used.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/join$/);
  expect(mutations).toEqual([]);
});

test('guest email sign-in redirects away from administrator destinations', async ({ page, mutations }) => {
  let authenticated = false;
  await page.route('**/session', route => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ username: user.email, password: 'my-long-guest-password' });
      authenticated = true;
      return route.fulfill({ json: { enabled: true, authenticated: true, token, expiresIn: 86400, role: 'user', user } });
    }
    return route.fulfill({ json: { enabled: true, authenticated, ...(authenticated ? { role: 'user', user } : {}) } });
  });
  await page.route('**/accounts/me', route => route.fulfill({ json: user }));
  await page.route('**/auth', route => route.fulfill({ json: { enabled: true } }));
  await page.goto('/login?redirect=/system');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('my-long-guest-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Guest', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
