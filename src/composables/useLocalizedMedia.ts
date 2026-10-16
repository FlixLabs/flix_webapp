import { computed, reactive, watch } from "vue";
import { metadataLocale } from "@/i18n/preferences";

type Kind = "movies" | "series" | "collection";
interface MediaIdentity {
  tmdbId?: unknown;
  tvdbId?: unknown;
  title?: string;
  overview?: string;
}
interface Translation {
  title?: string;
  overview?: string;
  resolvedId?: number;
  originalLanguage?: string;
  episodes?: Record<number, string>;
}
interface CacheEntry {
  value: Translation;
  expires: number;
  users: number;
  controller: AbortController;
  pending?: Promise<void>;
}
const cache = reactive(new Map<string, CacheEntry>());
const queue: (() => Promise<void>)[] = [];
let active = 0;
function runQueue() {
  while (active < 4 && queue.length) {
    active++;
    void queue.shift()!().finally(() => {
      active--;
      runQueue();
    });
  }
}
const positive = (id: unknown): id is number =>
  Number.isSafeInteger(id) && Number(id) > 0;
const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
async function json(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Metadata unavailable");
  return record(await response.json());
}
async function translateMedia(
  item: MediaIdentity,
  kind: Kind,
  locale: string,
  signal: AbortSignal,
): Promise<Translation> {
  const base = import.meta.env.VITE_TMDB_BASE_URL?.replace(/\/$/, "");
  const key = import.meta.env.VITE_TMDB_API_KEY;
  if (!base || !key) return {};
  const params = new URLSearchParams({
    api_key: key,
    language: locale === "original" ? "en-US" : locale,
  });
  let id = item.tmdbId;
  if (!positive(id) && kind === "series" && positive(item.tvdbId)) {
    const found = await json(
      `${base}/find/${item.tvdbId}?${params}&external_source=tvdb_id`,
      signal,
    );
    if (!Array.isArray(found.tv_results) || found.tv_results.length !== 1)
      return {};
    id = record(found.tv_results[0]).id;
  }
  if (!positive(id)) return {};
  const data = await json(
    `${base}/${kind === "movies" ? "movie" : kind === "series" ? "tv" : "collection"}/${id}?${params}&append_to_response=translations`,
    signal,
  );
  if (data.id !== id) return {};
  const translations = record(data.translations).translations;
  const original = Array.isArray(translations)
    ? translations
        .map(record)
        .find((entry) => entry.iso_639_1 === data.original_language)
    : undefined;
  const originalData = record(original?.data);
  const title = text(data.original_title) || text(data.original_name);
  if (locale === "original")
    return {
      resolvedId: id,
      originalLanguage: text(data.original_language),
      title:
        title ||
        text(originalData.title) ||
        text(originalData.name) ||
        text(data.title) ||
        text(data.name),
      overview: text(originalData.overview),
    };
  return {
    resolvedId: id,
    originalLanguage: text(data.original_language),
    title: text(data.title) || text(data.name) || title,
    overview: text(data.overview) || text(originalData.overview),
  };
}
function keyFor(
  item: MediaIdentity | null | undefined,
  kind: Kind,
  locale: string,
) {
  if (
    !item ||
    (!positive(item.tmdbId) && !(kind === "series" && positive(item.tvdbId)))
  )
    return "";
  return `${import.meta.env.VITE_TMDB_BASE_URL}:${kind}:${positive(item.tmdbId) ? `tmdb${item.tmdbId}` : `tvdb${item.tvdbId}`}:${locale}`;
}
function request(key: string, item: MediaIdentity, kind: Kind, locale: string) {
  return queueLoad(key, (signal) => translateMedia(item, kind, locale, signal));
}
function queueLoad(
  key: string,
  load: (signal: AbortSignal) => Promise<Translation>,
) {
  const existing = cache.get(key);
  if (
    existing &&
    !existing.controller.signal.aborted &&
    (existing.pending || existing.expires > Date.now())
  ) {
    existing.users++;
    return existing;
  }
  const entry: CacheEntry = reactive({
    value: existing?.value ?? {},
    expires: 0,
    users: 1,
    controller: new AbortController(),
  });
  cache.set(key, entry);
  entry.pending = new Promise<void>((resolve) => {
    queue.push(async () => {
      const timer = setTimeout(() => entry.controller.abort(), 8000);
      try {
        if (entry.controller.signal.aborted) return;
        const value = await load(entry.controller.signal);
        if (!entry.controller.signal.aborted) {
          entry.value = value;
          entry.expires = Date.now() + 30 * 60_000;
        }
      } catch {
        entry.expires = Date.now() + 60_000;
      } finally {
        clearTimeout(timer);
        entry.pending = undefined;
        resolve();
        if (
          entry.controller.signal.aborted &&
          !entry.users &&
          cache.get(key) === entry
        )
          cache.delete(key);
      }
    });
    runQueue();
  });
  if (cache.size > 300) {
    for (const [oldKey, old] of cache) {
      if (cache.size <= 300) break;
      if (!old.pending && !old.users && oldKey !== key) cache.delete(oldKey);
    }
  }
  return entry;
}
function release(entry: CacheEntry) {
  if (--entry.users <= 0 && entry.pending) entry.controller.abort();
}
export function useLocalizedEpisode(
  item: () => MediaIdentity & { season: number; episode: number },
) {
  useLocalizedMedia(item, () => "series");
  const key = computed(() => {
    const source = item();
    const rootKey = keyFor(source, "series", metadataLocale.value);
    const root = cache.get(rootKey)?.value;
    return root?.resolvedId &&
      Number.isInteger(source.season) &&
      source.season >= 0 &&
      Number.isInteger(source.episode) &&
      source.episode >= 0
      ? `${rootKey}:season:${source.season}`
      : "";
  });
  watch(
    key,
    (value, _previous, cleanup) => {
      if (!value) return;
      const source = { ...item() };
      const root = cache.get(
        keyFor(source, "series", metadataLocale.value),
      )!.value;
      const language =
        metadataLocale.value === "original"
          ? root.originalLanguage || "en"
          : metadataLocale.value;
      const entry = queueLoad(value, async (signal) => {
        const params = new URLSearchParams({
          api_key: import.meta.env.VITE_TMDB_API_KEY,
          language,
        });
        const data = await json(
          `${import.meta.env.VITE_TMDB_BASE_URL.replace(/\/$/, "")}/tv/${root.resolvedId}/season/${source.season}?${params}`,
          signal,
        );
        if (
          data.season_number !== source.season ||
          !Array.isArray(data.episodes)
        )
          return {};
        return {
          episodes: Object.fromEntries(
            data.episodes
              .map(record)
              .filter(
                (episode) =>
                  Number.isInteger(episode.episode_number) &&
                  text(episode.name),
              )
              .map((episode) => [
                Number(episode.episode_number),
                text(episode.name)!,
              ]),
          ),
        };
      });
      cleanup(() => release(entry));
    },
    { immediate: true },
  );
  return computed(
    () =>
      cache.get(key.value)?.value.episodes?.[item().episode] || item().title,
  );
}
export function useLocalizedMedia<T extends MediaIdentity>(
  item: () => T | null | undefined,
  kind: () => Kind,
) {
  const key = computed(() => keyFor(item(), kind(), metadataLocale.value));
  watch(
    key,
    (value, _previous, cleanup) => {
      const source = item();
      if (!value || !source) return;
      const entry = request(value, { ...source }, kind(), metadataLocale.value);
      cleanup(() => release(entry));
    },
    { immediate: true },
  );
  return computed(() => {
    const source = item();
    if (!source) return source;
    const translated = cache.get(key.value)?.value;
    return translated
      ? {
          ...source,
          ...(translated.title ? { title: translated.title } : {}),
          ...(translated.overview ? { overview: translated.overview } : {}),
        }
      : source;
  });
}
export function clearLocalizedMediaCache() {
  cache.clear();
}
export function localizedMediaTitle(item: MediaIdentity, kind: Kind) {
  return (
    cache.get(keyFor(item, kind, metadataLocale.value))?.value.title ||
    item.title ||
    ""
  );
}
export function localizedEpisodeTitle(
  item: MediaIdentity,
  season: number,
  episode: number,
  fallback: string,
) {
  const rootKey = keyFor(item, "series", metadataLocale.value);
  return (
    cache.get(`${rootKey}:season:${season}`)?.value.episodes?.[episode] ||
    fallback
  );
}
