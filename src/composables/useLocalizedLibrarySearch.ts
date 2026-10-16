import { onScopeDispose, ref, watch, type Ref } from "vue";
import { metadataContext, metadataLocale, region } from "@/i18n/preferences";
import type { MediaType } from "./useMediaService";

interface Identity {
  id?: number;
  tmdbId?: unknown;
  tvdbId?: unknown;
}
export function useLocalizedLibrarySearch(
  items: Ref<Identity[]>,
  search: Ref<string | null>,
  type: MediaType,
  enabled: () => boolean,
) {
  const matches = ref(new Set<number>()),
    loading = ref(false);
  let generation = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    controller: AbortController | undefined;
  function cancel() {
    generation++;
    clearTimeout(timer);
    controller?.abort();
    loading.value = false;
  }
  watch(
    [() => search.value?.trim(), metadataContext, enabled, items],
    () => {
      cancel();
      matches.value = new Set();
      const query = search.value?.trim() ?? "";
      const base = import.meta.env.VITE_TMDB_BASE_URL,
        key = import.meta.env.VITE_TMDB_API_KEY;
      if (
        !enabled() ||
        query.length < 3 ||
        !base ||
        !key ||
        !items.value.length
      )
        return;
      const current = generation,
        abort = new AbortController();
      controller = abort;
      loading.value = true;
      timer = setTimeout(async () => {
        const timeout = setTimeout(() => abort.abort(), 5000);
        try {
          const params = new URLSearchParams({
            api_key: key,
            query,
            language:
              metadataLocale.value === "original"
                ? "en-US"
                : metadataLocale.value,
            region: region.value,
            include_adult: "false",
          });
          const response = await fetch(
            `${base.replace(/\/$/, "")}/search/${type === "movies" ? "movie" : "tv"}?${params}`,
            { signal: abort.signal },
          );
          if (!response.ok) return;
          const data = await response.json();
          if (!Array.isArray(data?.results)) return;
          const tmdb = new Set<number>(
            data.results
              .filter((item: { id?: unknown }) =>
                Number.isSafeInteger(item?.id) && Number(item.id) > 0,
              )
              .map((item: { id: number }) => item.id),
          );
          const tvdb = new Set<number>();
          if (
            type === "series" &&
            items.value.some((item) => !item.tmdbId && item.tvdbId)
          ) {
            // Resolve only a bounded set of search candidates, never every library series.
            await Promise.all(
              [...tmdb].slice(0, 5).map(async (id) => {
                try {
                  const response = await fetch(
                    `${base.replace(/\/$/, "")}/tv/${id}/external_ids?api_key=${encodeURIComponent(key)}`,
                    { signal: abort.signal },
                  );
                  if (!response.ok) return;
                  const ids = await response.json();
                  if (ids.id === id && Number.isSafeInteger(ids.tvdb_id) && ids.tvdb_id > 0)
                    tvdb.add(ids.tvdb_id);
                } catch {
                  /* Keep native-title search available if a mapping is missing. */
                }
              }),
            );
          }
          if (current === generation && !abort.signal.aborted)
            matches.value = new Set(
              items.value
                .filter(
                  (item) =>
                    tmdb.has(Number(item.tmdbId)) ||
                    (type === "series" && tvdb.has(Number(item.tvdbId))),
                )
                .map((item) => item.id)
                .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0),
            );
        } catch {
          /* Translation search supplements, but never replaces, native matches. */
        } finally {
          clearTimeout(timeout);
          if (current === generation) loading.value = false;
        }
      }, 250);
    },
    { immediate: true },
  );
  onScopeDispose(cancel);
  return { matches, loading };
}
