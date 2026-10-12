import { test, expect, movie, series } from './fixtures';

for (const media of ['movies', 'series'] as const) {
  test(`${media} file details stay below the poster after scrolling`, async ({ page, mutations }) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 540 });
    await page.route(/\/api\/v3\/episode\?/, route => route.fulfill({ json: [{
      id: 21, title: 'Pilot', seasonNumber: 1, episodeNumber: 1, hasFile: true,
      episodeFile: { size: 4e9, relativePath: 'Pilot.mkv', quality: { quality: { name: 'HDTV-1080p' } } },
    }] }));
    await page.goto('/library');
    if (media === 'series') await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
    await page.locator('.media-card').click();
    const dialog = page.locator('.v-dialog');
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 400 });
    const details = dialog.locator('.media-supplemental-details');
    await expect(dialog.locator('.scroll-hint')).toBeInViewport();
    await expect(details).toBeHidden();
    await dialog.locator('.dialog-flex-text').evaluate(el => { el.scrollTop = 1; });
    await expect(details).toBeVisible();
    const gap = await dialog.evaluate(el => {
      const poster = el.querySelector('.media-poster')!.getBoundingClientRect();
      const label = el.querySelector('.media-supplemental-details .v-field-label--floating')!.getBoundingClientRect();
      return label.top - poster.bottom;
    });
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(mutations).toEqual([]);
  });
}

test('movie details hide the scroll hint as soon as scrolling starts and keep actions visible', async ({ page, mutations }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 520 });
  await page.route(/\/api\/v3\/movie\?/, route => route.fulfill({ json: [{ ...movie, overview: 'Long synopsis. '.repeat(400) }] }));
  await page.goto('/library');
  await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog');
  const body = dialog.locator('.dialog-flex-text');
  const hint = dialog.locator('.scroll-hint');
  await expect(hint).toBeInViewport();
  const fileDetails = dialog.locator('.media-file-details');
  await expect(fileDetails).toBeHidden();
  const originalHeight = await body.evaluate(el => el.scrollHeight);
  await body.evaluate(el => { el.scrollTop = 1; });
  await expect(hint).not.toBeVisible();
  await expect(fileDetails).toBeVisible();
  expect(await body.evaluate(el => el.scrollHeight)).toBe(originalHeight);
  await body.evaluate(el => { el.scrollTop = 0; });
  await expect(hint).toBeInViewport();
  await expect(fileDetails).toBeHidden();
  await body.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await body.evaluate(el => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
  await expect(hint).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  expect(await dialog.locator('.dialog-flex').evaluate(el => el.scrollTop)).toBe(0);
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(hint).not.toBeVisible();
  await expect(dialog.getByText('File added', { exact: true })).toBeInViewport();
  await dialog.getByRole('textbox', { name: 'File', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('textbox', { name: 'File', exact: true })).toHaveValue('Movie.mkv');
  await dialog.locator('.media-file-details').getByText('Size (GB)', { exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.locator('.media-file-details').getByText('Size (GB)', { exact: true })).toBeInViewport();
  await expect(dialog.locator('.media-file-details').getByText('Quality', { exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.media-card').click();
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBe(0);
  await expect(hint).toBeInViewport();
  expect(mutations).toEqual([]);
});

test('expanding a season updates scrolling without hiding the dialog actions', async ({ page, mutations }) => {
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 540 });
  await page.route(/\/api\/v3\/series\?/, route => route.fulfill({ json: [{ ...series, overview: 'Long series synopsis. '.repeat(100) }] }));
  await page.route(/\/api\/v3\/episode\?/, route => route.fulfill({ json: Array.from({ length: 25 }, (_, i) => ({
    id: i + 1, title: `Episode ${i + 1}`, seasonNumber: 1, episodeNumber: i + 1, hasFile: false,
    ...(i === 0 ? { episodeFile: { size: 4e9, relativePath: 'Pilot.mkv', quality: { quality: { name: 'HDTV-1080p' } } } } : {}),
  })) }));
  await page.goto('/library');
  await page.getByRole('button', { name: 'Series (1)', exact: true }).click();
  await page.locator('.media-card').click();
  const dialog = page.locator('.v-dialog');
  const body = dialog.locator('.dialog-flex-text');
  const size = dialog.getByRole('textbox', { name: 'Size (GB)', exact: true, includeHidden: true }).first();
  await expect(dialog.locator('.scroll-hint')).toBeInViewport();
  await expect(size).toHaveValue('4.00');
  await expect(size).toBeHidden();
  await body.evaluate(el => { el.scrollTop = 1; });
  await expect(size).toBeVisible();
  await expect(dialog.locator('.scroll-hint')).not.toBeVisible();
  await dialog.getByRole('button', { name: /Season 1/ }).click();
  await dialog.locator('.v-expansion-panel-text').evaluate(async el => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(el.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await dialog.getByText('Episode 25', { exact: true }).scrollIntoViewIfNeeded();
  await body.evaluate(el => { el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; });
  await expect(dialog.locator('.scroll-hint')).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await expect.poll(() => body.evaluate(el => {
    el.scrollTop = el.scrollHeight;
    return el.scrollHeight - el.clientHeight - el.scrollTop;
  })).toBeLessThanOrEqual(1);
  await expect(dialog.getByText('Episode 25', { exact: true })).toBeInViewport();
  await expect(dialog.locator('.scroll-hint')).not.toBeVisible();
  expect(mutations).toEqual([]);
});
