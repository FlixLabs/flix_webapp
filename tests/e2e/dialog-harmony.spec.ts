import { test, expect, movie } from './fixtures';

const images = [{ coverType: 'poster', remoteUrl: 'http://posters.test/poster.svg' }];
const saga = { id: 1, tmdbId: 100, title: 'A movie saga', movies: [
  { tmdbId: 10, title: movie.title, year: 2025, status: 'released', images },
  { tmdbId: 11, title: 'Missing movie', year: 2026, status: 'released', images },
] };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#263238"/></svg>';

test('media selectors keep rounded outer corners and square inner joins', async ({ page, mutations }) => {
  for (const route of ['/library', '/dashboard', '/downloads']) {
    await page.goto(route);
    const group = page.locator('[aria-label="Media type"]');
    await expect(group).toBeVisible();
    const corners = await group.evaluate(el => {
      const buttons = Array.from(el.querySelectorAll(':scope > .v-btn'));
      const radius = getComputedStyle(el).borderTopLeftRadius;
      return { radius, buttons: buttons.map(button => {
        const css = getComputedStyle(button);
        return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius];
      }) };
    });
    expect(parseFloat(corners.radius)).toBeGreaterThan(0);
    expect(corners.buttons[0]).toEqual([corners.radius, '0px', '0px', corners.radius]);
    expect(corners.buttons.at(-1)).toEqual(['0px', corners.radius, corners.radius, '0px']);
    for (const inner of corners.buttons.slice(1, -1)) expect(inner).toEqual(['0px', '0px', '0px', '0px']);
  }
  expect(mutations).toEqual([]);
});

test('all library tabs keep their icons, labels and counters inside the menu', async ({ page, mutations }) => {
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
  for (const width of [320, 412, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const tabs = page.locator('[aria-label="Media type"]');
    await expect.poll(() => tabs.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll('.v-btn__prepend, .v-btn__content')).every(node => {
        const rect = node.getBoundingClientRect();
        return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1
          && rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
    })).toBe(true);
    const styles = await tabs.locator('.v-btn').evaluateAll(buttons => buttons.map(button => {
      const icon = button.querySelector('.v-icon')!;
      const css = getComputedStyle(button);
      const glyph = getComputedStyle(icon, '::before').content;
      return { height: css.height, fontSize: css.fontSize, borderTop: css.borderTopStyle,
        hasIcon: !['none', 'normal', '""', "''"].includes(glyph) };
    }));
    expect(styles).toHaveLength(3);
    expect(styles[1]).toEqual(styles[0]);
    expect(styles[2]).toEqual(styles[0]);
    expect(styles[0].hasIcon).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(mutations).toEqual([]);
});

test('collections use the same navigation buttons and never displace desktop pagination', async ({ page, mutations }) => {
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: Array.from({ length: 241 }, (_, index) => ({ ...movie, id: index + 1 })) }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: Array.from({ length: 13 }, (_, index) => ({ ...saga, id: index + 1, tmdbId: 100 + index })) }));
  await page.goto('/library');
  const movies = page.getByRole('button', { name: 'Movies (241)', exact: true });
  const collections = page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true });
  await expect(movies).toBeVisible();
  await expect(collections).toHaveClass(/v-btn--variant-outlined/);
  expect(await collections.evaluate(el => el.parentElement === document.querySelector('[aria-label="Media type"]'))).toBe(true);
  if (page.viewportSize()!.width > 959) {
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(async () => {
        const button = (await movies.boundingBox())!;
        const pagination = (await page.getByRole('navigation', { name: 'Media results pages' }).locator('button').first().boundingBox())!;
        return Math.abs(button.y + button.height / 2 - pagination.y - pagination.height / 2);
      }).toBeLessThanOrEqual(2);
      const centers = await collections.evaluate(el => {
        const icon = el.querySelector('.v-btn__prepend')!.getBoundingClientRect();
        const text = el.querySelector('.v-btn__content')!.getBoundingClientRect();
        return Math.abs((icon.top + icon.bottom) / 2 - (text.top + text.bottom) / 2);
      });
      expect(centers).toBeLessThanOrEqual(2);
    }
    await collections.click();
    await expect(page.getByRole('button', { name: 'Collections (13)', exact: true })).toBeVisible();
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(async () => {
        const button = (await page.getByRole('button', { name: 'Collections (13)', exact: true }).boundingBox())!;
        const pagination = (await page.getByRole('navigation', { name: 'Media results pages' }).locator('button').first().boundingBox())!;
        return Math.abs(button.y + button.height / 2 - pagination.y - pagination.height / 2);
      }).toBeLessThanOrEqual(2);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(mutations).toEqual([]);
});

test('collection posters retain portrait proportions and Close matches the movie footer', async ({ page, mutations }) => {
  await page.route('http://posters.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Open collection A movie saga', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Collection: A movie saga', exact: true });
  const card = sheet.getByRole('button', { name: 'View Missing movie', exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('img')).toBeVisible();
  const ratio = await card.locator('.v-img').evaluate(el => { const r = el.getBoundingClientRect(); return r.width / r.height; });
  expect(ratio).toBeCloseTo(2 / 3, 2);
  const close = sheet.getByRole('button', { name: 'Close collection', exact: true });
  await expect(close).toHaveClass(/text-secondary/);
  expect(await close.evaluate(el => !!el.closest('.v-card-actions'))).toBe(true);
  const filter = await sheet.locator('.v-overlay__scrim').evaluate(el => getComputedStyle(el).backdropFilter);
  expect(filter).toBe('blur(5px)');
  await close.click();
  await page.getByRole('button', { name: 'Movies (1)', exact: true }).click();
  await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
  const media = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await expect(media.getByRole('button', { name: 'Close', exact: true })).toHaveClass(/text-secondary/);
  expect(mutations).toEqual([]);
});

test('empty supplemental sections cannot create a preview scroll hint', async ({ page, mutations }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.route('http://posters.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Open collection A movie saga', exact: true }).click();
  await page.getByRole('button', { name: 'View Missing movie', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Movie: Missing movie', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.media-supplemental-details')).toHaveCount(0);
  await expect(sheet.locator('.scroll-hint')).toHaveCount(0);
  await expect(sheet.locator('.dialog-flex-text')).toHaveClass(/dialog-no-overflow/);
  expect(mutations).toEqual([]);
});

test('a collection without members never advertises or permits empty scrolling', async ({ page, mutations }) => {
  await page.route('http://posters.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.route('**/api/v3/movie?*', route => route.fulfill({ json: [{ ...movie, images, collection: { tmdbId: 100, title: saga.title } }] }));
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [{ ...saga, images, movies: [] }] }));
  await page.goto('/library');
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Open collection A movie saga', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Collection: A movie saga', exact: true });
  await expect(sheet.locator('.v-img img')).toBeVisible();
  const body = sheet.locator('.dialog-flex-text');
  await expect(body).toHaveClass(/dialog-no-overflow/);
  await expect(sheet.locator('.scroll-hint')).toHaveCount(0);
  await body.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBe(0);
  expect(mutations).toEqual([]);
});

test('movie and collection galleries share their card measurements and inline counters', async ({ page, mutations }) => {
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  const metrics = async (card: ReturnType<typeof page.getByRole>) => card.evaluate(el => {
    const read = (selector: string) => {
      const node = el.querySelector(selector)!;
      const css = getComputedStyle(node);
      return { height: css.height, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight, padding: css.padding };
    };
    return { title: read('.title-line'), subtitle: read('.media-date'), status: read('.media-card-status'), poster: read('.v-img') };
  });
  const media = page.getByRole('button', { name: `Open ${movie.title}`, exact: true });
  await expect(media).toBeVisible();
  const before = await metrics(media);
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  const collection = page.getByRole('button', { name: 'Open collection A movie saga', exact: true });
  await expect(collection).toBeVisible();
  expect(await metrics(collection)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Collections (1)', exact: true })).toBeVisible();
  await expect(page.getByText('1 collections', { exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test('collection and movie sheets share the poster summary and Close button', async ({ page, mutations }) => {
  await page.route('**/api/v3/collection?*', route => route.fulfill({ json: [saga] }));
  await page.goto('/library');
  await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
  const media = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  await expect(media.locator('.media-summary')).toBeVisible();
  const measurements = async (sheet: ReturnType<typeof page.getByRole>, closeLabel: string) => {
    const summary = await sheet.locator('.media-summary').evaluate(el => {
      const title = getComputedStyle(el.querySelector('.title-line')!);
      const fact = getComputedStyle(el.querySelector('.meta-label')!);
      return { titleSize: title.fontSize, titleWeight: title.fontWeight, titleLine: title.lineHeight, factSize: fact.fontSize };
    });
    const close = await sheet.getByRole('button', { name: closeLabel, exact: true }).evaluate(el => {
      const css = getComputedStyle(el);
      return { fontSize: css.fontSize, weight: css.fontWeight, color: css.color, height: css.height, padding: css.padding };
    });
    return { summary, close };
  };
  const before = await measurements(media, 'Close');
  await media.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(media).not.toBeVisible();
  await page.getByRole('button', { name: /^Collections(?: \([^)]+\))?$/, exact: true }).click();
  await page.getByRole('button', { name: 'Open collection A movie saga', exact: true }).click();
  const collection = page.getByRole('dialog', { name: 'Collection: A movie saga', exact: true });
  await expect(collection.locator('.media-summary')).toBeVisible();
  expect(await measurements(collection, 'Close collection')).toEqual(before);
  await expect(collection.locator('.media-summary').getByText('Existing', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test('closing a media sheet keeps its details and blur until the fade completes', async ({ page, mutations }) => {
  await page.goto('/library');
  await page.getByRole('button', { name: `Open ${movie.title}`, exact: true }).click();
  const sheet = page.getByRole('dialog', { name: `Movie: ${movie.title}`, exact: true });
  const close = sheet.getByRole('button', { name: 'Close', exact: true });
  await expect(sheet.getByRole('button', { name: 'Media history', exact: true, includeHidden: true })).toBeAttached();
  const state = await close.evaluate(async button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const overlay = button.closest('.v-dialog')!;
    const scrim = overlay.querySelector('.v-overlay__scrim')!;
    return { rootBlur: getComputedStyle(overlay).backdropFilter, scrimBlur: getComputedStyle(scrim).backdropFilter,
      leaving: scrim.classList.contains('fade-transition-leave-active'),
      history: !!overlay.querySelector('[aria-label="Media history"]') };
  });
  expect(state).toEqual({ rootBlur: 'none', scrimBlur: 'blur(5px)', leaving: true, history: true });
  await expect(sheet).not.toBeVisible();
  expect(mutations).toEqual([]);
});
