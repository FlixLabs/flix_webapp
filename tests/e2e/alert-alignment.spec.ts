import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectCentered(alert: Locator, selector: string) {
  const content = await alert.locator('.v-alert__content').boundingBox();
  const icon = await alert.locator(selector).boundingBox();
  expect(content).not.toBeNull();
  expect(icon).not.toBeNull();
  expect(Math.abs(icon!.y + icon!.height / 2 - content!.y - content!.height / 2)).toBeLessThanOrEqual(2);
}

test('notification icons and dismiss button stay vertically centered', async ({ page, mutations }) => {
  await page.route('**/session', route => route.fulfill({ json: { enabled: true, authenticated: false } }));
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const alert = page.locator('.fixed-alert');
  await expect(alert).toBeVisible();
  await expectCentered(alert, '.v-alert__prepend .v-icon');
  await expectCentered(alert, '.v-alert__close .v-btn');
  await alert.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await expect(alert).not.toBeVisible();
  expect(mutations).toEqual([]);
});

test('inline error icons remain centered beside multiline feedback and Retry', async ({ page, mutations }) => {
  await page.route('**/admin/accounts', route => route.fulfill({ status: 404, contentType: 'text/html', body: '<pre>Cannot GET /admin/accounts</pre>' }));
  await page.goto('/users');
  const alert = page.locator('.v-alert').filter({ hasText: 'User management is unavailable on this API.' });
  await expect(alert).toBeVisible();
  await expectCentered(alert, '.v-alert__prepend .v-icon');
  expect(mutations).toEqual([]);
});
