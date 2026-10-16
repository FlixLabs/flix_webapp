import { test, expect } from './fixtures';

for (const authenticated of [true, false]) {
  test(`first visit waits for session before ${authenticated ? 'opening public dashboard' : 'showing sign-in'}`, async ({ page, mutations }) => {
    await page.addInitScript(() => {
      sessionStorage.clear();
      const state = window as typeof window & { loginFormShown?: boolean };
      new MutationObserver(() => {
        if (document.querySelector('input[autocomplete="username"]')) state.loginFormShown = true;
      }).observe(document, { childList: true, subtree: true });
    });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let reads = 0;
    await page.route('**/session', async route => {
      reads++;
      await gate;
      await route.fulfill({ json: { enabled: !authenticated, authenticated } });
    });
    await page.goto('/');
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveCount(0);
    await expect(page.getByText('Loading data...', { exact: true })).toBeVisible();
    release();
    if (authenticated) {
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(await page.evaluate(() => (window as typeof window & { loginFormShown?: boolean }).loginFormShown)).not.toBe(true);
    } else {
      await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    }
    expect(mutations).toEqual([]);
  });
}

test('failed session check offers Retry without displaying a sign-in form', async ({ page, mutations }) => {
  let available = false;
  await page.route('**/session', route => available
    ? route.fulfill({ json: { enabled: true, authenticated: false } })
    : route.fulfill({ status: 503, json: { error: 'Authentication unavailable.' } }));
  await page.goto('/login');
  const retry = page.getByRole('button', { name: 'Retry Login configuration', exact: true });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveCount(0);
  await expect(page.getByText('Loading data...', { exact: true })).toHaveCount(0);
  available = true;
  await retry.click();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});
