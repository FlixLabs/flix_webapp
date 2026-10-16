import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

async function expectCentered(alert: Locator, selector: string) {
  // Sample both boxes in one frame while the notification is animating.
  const offset = await alert.evaluate((element, iconSelector) => {
    const content = element.querySelector('.v-alert__content')?.getBoundingClientRect();
    const icon = element.querySelector(iconSelector)?.getBoundingClientRect();
    return content && icon ? Math.abs(icon.y + icon.height / 2 - content.y - content.height / 2) : null;
  }, selector);
  expect(offset).not.toBeNull();
  expect(offset).toBeLessThanOrEqual(2);
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
