import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const drawerSelector = '#navigation-drawer';

async function openNavigation(page: Page, active: string) {
  await expect(page.getByRole('heading', { name: active, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.locator(drawerSelector);
  await expect(drawer).toHaveClass(/v-navigation-drawer--active/);
  await expect(drawer.getByRole('link', { name: active, exact: true })).toHaveAttribute('aria-current', 'page');
  // Wait for geometry, not a fixed timeout, before measuring the closing transition.
  await expect.poll(() => drawer.evaluate(el => Math.abs(el.getBoundingClientRect().x))).toBeLessThan(1);
  return drawer;
}

async function expectClosed(page: Page) {
  await expect(page.locator(drawerSelector)).not.toHaveClass(/v-navigation-drawer--active/);
  await expect(page.locator(drawerSelector)).toHaveAttribute('inert', '');
  await expect.poll(() => page.locator(drawerSelector).evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
}

test('opening and route changes never resize or shift the main content', async ({ page, mutations }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/library');
  const main = page.locator('#main-content');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  const baseline = await main.evaluate(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, padding: getComputedStyle(el).paddingLeft }));
  const drawer = await openNavigation(page, 'Library');
  await expect(drawer).toHaveClass(/v-navigation-drawer--temporary/);
  expect(await main.evaluate(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, padding: getComputedStyle(el).paddingLeft }))).toEqual(baseline);

  const frames = await page.evaluate(async () => {
    const drawer = document.getElementById('navigation-drawer')!;
    const main = document.getElementById('main-content')!;
    const items = drawer.textContent;
    const samples: { x: number; width: number; padding: string; itemsStable: boolean }[] = [];
    (drawer.querySelector('a[href="/settings"]') as HTMLAnchorElement).click();
    // Sample until the actual transition finishes, with a bounded safety deadline.
    const deadline = performance.now() + 3000;
    do {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const box = main.getBoundingClientRect();
      samples.push({ x: box.x, width: box.width, padding: getComputedStyle(main).paddingLeft, itemsStable: drawer.textContent === items });
      if (drawer.hasAttribute('inert') && drawer.getBoundingClientRect().right <= 1) break;
    } while (performance.now() < deadline);
    return samples;
  });
  expect(frames.length).toBeGreaterThan(0);
  for (const frame of frames) expect(frame).toEqual({ ...baseline, itemsStable: true });
  await expect(page).toHaveURL(/\/settings$/);
  await expectClosed(page);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await openNavigation(page, 'Settings');
  expect(mutations).toEqual([]);
});

test('active route follows Back and Forward and closes an open drawer', async ({ page, mutations }) => {
  await page.goto('/library');
  await openNavigation(page, 'Library');
  await page.locator(drawerSelector).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expectClosed(page);
  await openNavigation(page, 'Settings');
  await page.goBack();
  await expect(page).toHaveURL(/\/library$/);
  await expectClosed(page);
  await openNavigation(page, 'Library');
  await page.goForward();
  await expect(page).toHaveURL(/\/settings$/);
  await expectClosed(page);
  const drawer = await openNavigation(page, 'Settings');
  await expect(drawer.locator('[aria-current="page"]')).toHaveCount(1);
  // Selecting the current route must still dismiss the drawer.
  await drawer.getByRole('link', { name: 'Settings', exact: true }).click();
  await expectClosed(page);
  expect(mutations).toEqual([]);
});

test('keyboard navigation traps focus, supports Escape and restores the toggle', async ({ page, mutations }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Open navigation', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  const drawer = page.locator(drawerSelector);
  await expect(drawer.getByRole('link', { name: 'Library', exact: true })).toBeFocused();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab');
    expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expectClosed(page);
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Space');
  const settings = drawer.getByRole('link', { name: 'Settings', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await expectClosed(page);
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await drawer.evaluate(el => el.contains(document.activeElement))).toBe(false);
  expect(mutations).toEqual([]);
});

test('scrim dismissal and rapid reopening preserve the active route', async ({ page, mutations }) => {
  await page.goto('/library');
  await openNavigation(page, 'Library');
  await page.locator('.v-navigation-drawer__scrim').click({ position: { x: page.viewportSize()!.width - 20, y: 120 } });
  await expectClosed(page);
  const toggle = page.locator('#navigation-toggle');
  // Exercise interrupted transitions without waiting for an animation duration.
  await toggle.evaluate(el => { (el as HTMLElement).click(); (el as HTMLElement).click(); (el as HTMLElement).click(); });
  const drawer = page.locator(drawerSelector);
  await expect(drawer).toHaveClass(/v-navigation-drawer--active/);
  await expect(drawer.getByRole('link', { name: 'Library', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expectClosed(page);
  await expect(page).toHaveURL(/\/library$/);
  expect(mutations).toEqual([]);
});

test('reduced motion disables drawer and scrim animation without breaking navigation', async ({ page, mutations }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/library');
  const drawer = await openNavigation(page, 'Library');
  for (const element of [drawer, page.locator('.v-navigation-drawer__scrim')]) {
    const durations = await element.evaluate(el => {
      const style = getComputedStyle(el);
      return [style.transitionDuration, style.animationDuration].flatMap(value => value.split(',').map(parseFloat));
    });
    expect(durations.every(duration => duration < 0.01)).toBe(true);
  }
  await drawer.getByRole('link', { name: 'Settings', exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/settings$/);
  await expectClosed(page);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  expect(mutations).toEqual([]);
});
