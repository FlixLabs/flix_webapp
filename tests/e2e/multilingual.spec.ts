import { test, expect, movie } from "./fixtures";

test.use({ locale: "fr-FR" });

test("detects French for navigation, buttons, tags and accessibility labels", async ({
  page,
  mutations,
}) => {
  await page.goto("/library");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("heading", { name: "Bibliothèque", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Films (1)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Ouvrir ${movie.title}`, exact: true }),
  ).toContainText("Présent");
  await expect(
    page.getByRole("textbox", { name: "Rechercher", exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test("changes the interface immediately, persists it and keeps content preferences independent", async ({
  page,
  mutations,
}) => {
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Langue et région", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Langue de l’interface", exact: true })
    .locator("..")
    .click();
  await page.getByRole("option", { name: "Anglais", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const content = page.getByRole("combobox", {
    name: "Content language",
    exact: true,
  });
  await expect(content.locator("..")).toContainText("French");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("button", { name: "Language and region", exact: true })
    .click();
  await expect(
    page
      .getByRole("combobox", { name: "Content language", exact: true })
      .locator(".."),
  ).toContainText("French");
  expect(mutations).toEqual([]);
});

test("localizes movie metadata without mutating native identifiers or settings", async ({
  page,
  mutations,
}) => {
  const requests: URL[] = [];
  await page.route("**/movie/10?*", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: {
        id: 10,
        title: "Un film français",
        overview: "Un résumé en français.",
        original_title: movie.title,
        original_language: "en",
      },
    });
  });
  await page.goto("/library");
  const card = page.getByRole("button", {
    name: "Ouvrir Un film français",
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Un résumé en français.");
  await expect(
    dialog.getByRole("button", { name: "Supprimer", exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(1);
  expect(requests[0]!.searchParams.get("language")).toBe("fr-FR");
  expect(mutations).toEqual([]);
});

test("preserves original titles and synopses when selected translations are missing", async ({
  page,
  mutations,
}) => {
  await page.route("**/movie/10?*", (route) =>
    route.fulfill({
      json: {
        id: 10,
        title: "",
        overview: "",
        original_title: "Original film",
        original_language: "ja",
        translations: {
          translations: [
            { iso_639_1: "ja", data: { overview: "Synopsis original." } },
          ],
        },
      },
    }),
  );
  await page.goto("/library");
  await page
    .getByRole("button", { name: "Ouvrir Original film", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Synopsis original.");
  expect(mutations).toEqual([]);
});

test("keeps the library usable when translated metadata is unavailable", async ({
  page,
  mutations,
}) => {
  await page.route("**/movie/10?*", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/library");
  await page
    .getByRole("button", { name: `Ouvrir ${movie.title}`, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(movie.overview);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Supprimer", exact: true }),
  ).toBeEnabled();
  expect(mutations).toEqual([]);
});

test("uses the selected content locale and region for upcoming releases", async ({
  page,
  mutations,
}) => {
  const requests: URL[] = [];
  await page.route("**/upcoming?*", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: { results: [], total_pages: 1 } });
  });
  await page.goto("/outings");
  await expect(
    page.getByRole("heading", { name: "Sorties", exact: true }),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  expect(mutations).toEqual([]);
  expect(
    requests.every(
      (url) =>
        url.searchParams.get("language") === "fr-FR" &&
        url.searchParams.get("region") === "FR",
    ),
  ).toBe(true);
});

test("shows a French calendar with a Monday-first week", async ({
  page,
  mutations,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "flix.preferences.calendar.layout",
      JSON.stringify("calendar"),
    );
    localStorage.setItem(
      "flix.preferences.calendar.date",
      JSON.stringify("2026-10-15"),
    );
  });
  await page.goto("/calendar");
  await expect(
    page.getByRole("heading", { name: "Calendrier", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".v-calendar-weekly__head-weekday").first(),
  ).toContainText(/lun/i);
  await expect(page.getByText(/octobre 2026/i).first()).toBeVisible();
  await expect(page.getByText(/de plus/i).first()).toBeVisible();
  expect(mutations).toEqual([]);
});

test("finds a native library movie by a translated title without rewriting the movie", async ({
  page,
  mutations,
}) => {
  await page.route("**/search/movie?*", (route) =>
    route.fulfill({
      json: { results: [{ id: movie.tmdbId, title: "Le titre traduit" }] },
    }),
  );
  await page.route("**/movie/10?*", (route) =>
    route.fulfill({
      json: { id: 10, title: "Le titre traduit", overview: "Résumé traduit" },
    }),
  );
  await page.goto("/library");
  await page
    .getByRole("textbox", { name: "Rechercher", exact: true })
    .fill("titre traduit");
  await expect(
    page.getByRole("button", { name: "Ouvrir Le titre traduit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ouvrir Le titre traduit", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Résumé traduit");
  expect(mutations).toEqual([]);
});

test("localizes collection members and keeps French confirmation actions inside the sheet", async ({
  page,
  mutations,
}) => {
  const saga = {
    id: 5,
    tmdbId: 100,
    title: "Native saga",
    movies: [
      { tmdbId: 10, title: movie.title, status: "released" },
      { tmdbId: 11, title: "Native sequel", status: "released" },
    ],
  };
  await page.route("**/api/v3/collection?*", (route) =>
    route.fulfill({ json: [saga] }),
  );
  await page.route("**/collection/100?*", (route) =>
    route.fulfill({
      json: {
        id: 100,
        name: "Une saga française",
        overview: "Présentation de la collection.",
      },
    }),
  );
  await page.route("**/movie/11?*", (route) =>
    route.fulfill({ json: { id: 11, title: "La suite" } }),
  );
  await page.goto("/library");
  await page
    .getByRole("button", { name: "Collections (1)", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Ouvrir la collection Une saga française",
      exact: true,
    })
    .click();
  const sheet = page.getByRole("dialog", {
    name: "Collection : Une saga française",
    exact: true,
  });
  const request = sheet.getByRole("button", {
    name: "Télécharger les films manquants (1)",
    exact: true,
  });
  await expect(request).toBeVisible();
  const bounds = await request.evaluate((el) => {
    const button = el.getBoundingClientRect(),
      parent = el.closest(".v-overlay__content")!.getBoundingClientRect();
    return {
      left: button.left - parent.left,
      right: parent.right - button.right,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeGreaterThanOrEqual(0);
  await request.click();
  const confirmation = page.getByRole("dialog", {
    name: "Télécharger les films manquants",
    exact: true,
  });
  await expect(
    confirmation.getByRole("checkbox", {
      name: "Demander La suite",
      exact: true,
    }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});

test("localizes series and episode names through stable TVDB identifiers", async ({
  page,
  mutations,
}) => {
  await page.route("**/find/20?*", (route) =>
    route.fulfill({ json: { tv_results: [{ id: 20 }] } }),
  );
  await page.route("**/tv/20?*", (route) =>
    route.fulfill({
      json: {
        id: 20,
        name: "Une série française",
        overview: "Résumé de la série.",
        original_language: "en",
      },
    }),
  );
  await page.route("**/tv/20/season/1?*", (route) =>
    route.fulfill({
      json: {
        season_number: 1,
        episodes: [{ episode_number: 1, name: "Premier épisode traduit" }],
      },
    }),
  );
  await page.goto("/library");
  await page.getByRole("button", { name: "Séries (1)", exact: true }).click();
  await page
    .getByRole("button", { name: "Ouvrir Une série française", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await dialog.locator(".dialog-flex-text").evaluate((el) => {
    el.scrollTop = 1;
  });
  const season = dialog.getByRole("button", { name: /Saison 1/ });
  await season.scrollIntoViewIfNeeded();
  await season.click();
  await expect(
    dialog.getByText("Premier épisode traduit", { exact: true }),
  ).toBeVisible();
  expect(mutations).toEqual([]);
});
