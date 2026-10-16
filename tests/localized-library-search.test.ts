import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";
import {
  useLibraryFilters,
  defaultLibraryFilters,
} from "@/composables/useLibraryFilters";
let scope: ReturnType<typeof effectScope>;
beforeEach(() => {
  scope = effectScope();
  vi.useFakeTimers();
  vi.stubEnv("VITE_TMDB_BASE_URL", "http://tmdb.test");
  vi.stubEnv("VITE_TMDB_API_KEY", "test");
});
afterEach(() => {
  scope.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("supplements native-title filtering with translated identities and still applies the normal filters", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ results: [{ id: 10, title: "Titre traduit" }] }),
      ),
  );
  const items = ref([
    { id: 1, tmdbId: 10, title: "Native title", hasFile: true },
  ]);
  const search = ref<string | null>("Titre traduit"),
    filters = ref(defaultLibraryFilters());
  const result = scope.run(() =>
    useLibraryFilters(items, search, filters, {
      type: "movies",
      enabled: () => true,
    }),
  )!;
  expect(result.translationLoading.value).toBe(true);
  await vi.advanceTimersByTimeAsync(250);
  expect(result.filteredItems.value).toEqual(items.value);
  filters.value.availability = "missing";
  expect(result.filteredItems.value).toEqual([]);
  expect(items.value[0]!.title).toBe("Native title");
});
it("keeps native matches usable if TMDB is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  const items = ref([{ id: 1, tmdbId: 10, title: "Native title" }]);
  const result = scope.run(() =>
    useLibraryFilters(items, ref("Native"), ref(defaultLibraryFilters()), {
      type: "movies",
      enabled: () => true,
    }),
  )!;
  await vi.advanceTimersByTimeAsync(250);
  expect(result.translationLoading.value).toBe(false);
  expect(result.filteredItems.value).toEqual(items.value);
});
it('rejects invalid translated identities before matching native library entries', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ results: [{ id: -1, title: 'Invalid' }, { id: 0, title: 'Invalid' }] }));
  vi.stubGlobal('fetch', fetch);
  const items = ref([{ id: 1, tvdbId: 200, title: 'Native series' }, { id: 2, title: 'Unknown series' }]);
  const result = scope.run(() => useLibraryFilters(items, ref('Unrelated query'), ref(defaultLibraryFilters()), { type: 'series', enabled: () => true }))!;
  await vi.advanceTimersByTimeAsync(250);
  expect(result.filteredItems.value).toEqual([]);
  expect(fetch).toHaveBeenCalledOnce();
});
