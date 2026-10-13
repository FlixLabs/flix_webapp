import { test, expect, movie } from './fixtures';
import type { Page } from '@playwright/test';

async function settleLayout(page: Page) {
  await page.locator('.v-container:not(.flix-page-heading)').evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
}

test('library tools stay together without displacing or overflowing the navigation', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: Array.from({ length: 241 }, (_, index) => ({ ...movie, id: index + 1 })) }));
  await page.goto('/library');
  const select = page.getByRole('button', { name: 'Select media', exact: true });
  const tools = page.getByRole('button', { name: 'Library tools', exact: true });
  await expect(select).toBeVisible();
  for (const width of [320, 412, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1200 });
    await settleLayout(page);
    const first = (await select.boundingBox())!;
    const second = (await tools.boundingBox())!;
    expect(Math.abs(first.y + first.height / 2 - second.y - second.height / 2)).toBeLessThanOrEqual(1);
    expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
    expect(second.x + second.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 960) {
      const tabs = (await page.getByRole('button', { name: 'Movies (241)', exact: true }).boundingBox())!;
      const pagination = (await page.getByRole('navigation', { name: 'Media results pages' }).locator('button').first().boundingBox())!;
      expect(Math.abs(tabs.y + tabs.height / 2 - pagination.y - pagination.height / 2)).toBeLessThanOrEqual(2);
    }
  }
  expect(mutations).toEqual([]);
});

test('library buttons retain their positions during selection and processing', async ({ page, mutations }) => {
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: Array.from({ length: 13 }, (_, index) => ({
    ...movie, id: index + 1, title: `Movie ${index + 1}`, monitored: true,
  })) }));
  let finish!: () => Promise<void>;
  await page.route('**/api/v3/command', route => { finish = () => route.fulfill({ json: {} }); });
  await page.goto('/library');
  const select = page.getByRole('button', { name: 'Select media', exact: true });
  const tools = page.getByRole('button', { name: 'Library tools', exact: true });
  await expect(select).toBeEnabled();
  await settleLayout(page);
  const toolbarPositions = [await select.boundingBox(), await tools.boundingBox()];
  await select.click();
  expect([await select.boundingBox(), await tools.boundingBox()]).toEqual(toolbarPositions);
  const actions = page.getByRole('button', { name: 'Selection actions', exact: true });
  const stop = page.getByRole('button', { name: 'Stop after current item', exact: true });
  await expect(actions).toBeVisible();
  await settleLayout(page);
  const positions = [await actions.boundingBox(), await stop.boundingBox()];
  await page.getByRole('button', { name: 'Select page', exact: true }).click();
  await expect(actions).toBeEnabled();
  expect([await actions.boundingBox(), await stop.boundingBox()]).toEqual(positions);
  await actions.click();
  const actionItem = page.getByRole('menuitem', { name: 'Search selected', exact: true });
  await expect(actionItem).toBeInViewport({ ratio: 1 });
  await actionItem.evaluate(async el => {
    await Promise.all(el.closest('.v-overlay__content')!.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  // A real pointer click avoids the test driver's automatic scroll-into-view.
  const target = (await actionItem.boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await expect(stop).toBeEnabled();
  expect([await actions.boundingBox(), await stop.boundingBox()]).toEqual(positions);
  await stop.click();
  await expect.poll(() => typeof finish).toBe('function'); await finish();
  await expect(stop).toBeDisabled();
  await expect(actions).toBeEnabled();
  expect([await actions.boundingBox(), await stop.boundingBox()]).toEqual(positions);
  expect(mutations).toEqual([]);
});
