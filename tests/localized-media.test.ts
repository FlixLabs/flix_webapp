import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, ref, nextTick } from "vue";
import { contentLanguage, region } from "@/i18n/preferences";
import {
  useLocalizedMedia,
  clearLocalizedMediaCache,
} from "@/composables/useLocalizedMedia";
let scope: ReturnType<typeof effectScope>;
beforeEach(() => {
  scope = effectScope();
  clearLocalizedMediaCache();
  vi.stubEnv("VITE_TMDB_BASE_URL", "http://tmdb.test");
  vi.stubEnv("VITE_TMDB_API_KEY", "test-only");
  region.value = "FR";
  contentLanguage.value = "fr";
});
afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  contentLanguage.value = "en";
  region.value = "US";
});
it("shares requests, changes display fields only and falls back to original metadata", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        id: 10,
        title: "",
        original_title: "Original title",
        original_language: "ja",
        overview: "",
        translations: {
          translations: [
            { iso_639_1: "ja", data: { overview: "Original overview" } },
          ],
        },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const item = ref({
    id: 1,
    tmdbId: 10,
    title: "Native title",
    overview: "Native overview",
    qualityProfileId: 5,
  });
  const first = scope.run(() =>
    useLocalizedMedia(
      () => item.value,
      () => "movies",
    ),
  )!;
  const second = scope.run(() =>
    useLocalizedMedia(
      () => item.value,
      () => "movies",
    ),
  )!;
  await vi.waitFor(() => expect(first.value?.title).toBe("Original title"));
  expect(second.value?.overview).toBe("Original overview");
  expect(fetch).toHaveBeenCalledOnce();
  expect(item.value.title).toBe("Native title");
  expect(first.value?.id).toBe(1);
  expect(first.value?.qualityProfileId).toBe(5);
  expect(new URL(fetch.mock.calls[0]![0]).searchParams.get("language")).toBe(
    "fr-FR",
  );
});
it("ignores a late translation after switching content language", async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      new URL(url).searchParams.get("language") === "fr-FR"
        ? new Promise<Response>((done) => {
            resolve = done;
          })
        : Promise.resolve(Response.json({ id: 10, title: "English title" })),
    ),
  );
  const item = { id: 1, tmdbId: 10, title: "Native title" };
  const localized = scope.run(() =>
    useLocalizedMedia(
      () => item,
      () => "movies",
    ),
  )!;
  contentLanguage.value = "en";
  await nextTick();
  await vi.waitFor(() => expect(localized.value?.title).toBe("English title"));
  resolve(Response.json({ id: 10, title: "French title" }));
  await nextTick();
  expect(localized.value?.title).toBe("English title");
});
it("keeps usable native content when TMDB fails or returns the wrong identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ id: 99, title: "Wrong media" })),
  );
  const item = {
    tmdbId: 10,
    title: "Native title",
    overview: "Native overview",
  };
  const localized = scope.run(() =>
    useLocalizedMedia(
      () => item,
      () => "movies",
    ),
  )!;
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(localized.value?.title).toBe("Native title");
  expect(localized.value?.overview).toBe("Native overview");
});
it("resolves series only by their TVDB identity and shares a season request", async () => {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      Response.json(
        url.includes("/find/")
          ? { tv_results: [{ id: 20 }] }
          : url.includes("/season/")
            ? {
                season_number: 1,
                episodes: [{ episode_number: 1, name: "Épisode traduit" }],
              }
            : { id: 20, name: "Série traduite", original_language: "en" },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const { useLocalizedEpisode } =
    await import("@/composables/useLocalizedMedia");
  const title = scope.run(() =>
    useLocalizedEpisode(() => ({
      tvdbId: 200,
      season: 1,
      episode: 1,
      title: "Native episode",
    })),
  )!;
  const media = scope.run(() =>
    useLocalizedMedia(
      () => ({ tvdbId: 200, title: "Native series" }),
      () => "series",
    ),
  )!;
  await vi.waitFor(() => expect(title.value).toBe("Épisode traduit"));
  expect(media.value?.title).toBe("Série traduite");
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("/find/")),
  ).toHaveLength(1);
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("/season/")),
  ).toHaveLength(1);
});
it("bounds parallel requests and cancels requests belonging to closed views", async () => {
  let active = 0,
    maximum = 0,
    aborted = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      active++;
      maximum = Math.max(maximum, active);
      return new Promise<Response>((_resolve, reject) =>
        init.signal!.addEventListener(
          "abort",
          () => {
            active--;
            aborted++;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        ),
      );
    }),
  );
  scope.run(() => {
    for (let id = 1; id <= 12; id++)
      useLocalizedMedia(
        () => ({ tmdbId: id, title: `Media ${id}` }),
        () => "movies",
      );
  });
  expect(maximum).toBe(4);
  scope.stop();
  await vi.waitFor(() => expect(active).toBe(0));
  expect(aborted).toBe(4);
});
it("uses original-language titles and synopses when that content preference is selected", async () => {
  contentLanguage.value = "original";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({
          id: 10,
          title: "Translated title",
          overview: "Translated overview",
          original_title: "Original title",
          original_language: "ja",
          translations: {
            translations: [
              { iso_639_1: "ja", data: { overview: "Original synopsis" } },
            ],
          },
        }),
      ),
  );
  const localized = scope.run(() =>
    useLocalizedMedia(
      () => ({ tmdbId: 10, title: "Native title" }),
      () => "movies",
    ),
  )!;
  await vi.waitFor(() => expect(localized.value?.title).toBe("Original title"));
  expect(localized.value?.overview).toBe("Original synopsis");
});
