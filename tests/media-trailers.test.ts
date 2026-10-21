import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { loadTrailer, selectTrailer, trailerUrls } from '@/composables/mediaTrailers';
import { useMediaTrailer } from '@/composables/useMediaTrailer';
import { metadataLocale } from '@/i18n/preferences';

const video = (overrides = {}) => ({
  site: 'YouTube', type: 'Trailer', key: 'abcdefghijk', name: 'Official trailer',
  iso_639_1: 'fr', official: true, published_at: '2026-01-01', ...overrides,
});
const response = (results: unknown[]) => new Response(JSON.stringify({ results }));
beforeEach(() => {
  vi.stubEnv('VITE_TMDB_BASE_URL', 'http://tmdb.test');
  vi.stubEnv('VITE_TMDB_API_KEY', 'test-only');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('prefers official trailers, then the most recent, in the requested language', () => {
  const results = [video({ official: false, published_at: '2026-10-01' }),
    video({ key: 'bcdefghijkl', published_at: '2026-02-01' }), video(),
    video({ key: 'cdefghijklm', iso_639_1: 'en', published_at: '2026-10-01' })];
  expect(selectTrailer({ results }, 'fr')?.key).toBe('bcdefghijkl');
});
it('ignores unsupported hosts, clips, malformed entries, unsafe keys and other languages', () => {
  expect(selectTrailer({ results: [null, {}, video({ site: 'Vimeo' }), video({ type: 'Clip' }),
    video({ key: '../danger' }), video({ iso_639_1: 'de' })] }, 'fr')).toBeNull();
});
it('distinguishes an empty result from a broken response', () => {
  expect(selectTrailer({ results: [] }, 'en')).toBeNull();
  for (const payload of [null, [], {}, { results: null }]) {
    expect(() => selectTrailer(payload, 'en')).toThrow('Unable to load trailers');
  }
});
it('builds fixed-host player and external URLs without autoplay', () => {
  expect(trailerUrls('abcdefghijk')).toEqual({
    embed: 'https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=0&playsinline=1&rel=0',
    external: 'https://www.youtube.com/watch?v=abcdefghijk',
  });
  expect(() => trailerUrls('https://evil.test')).toThrow();
});
it('falls back to English only when no valid preferred-language trailer exists', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response([video({ type: 'Clip' })]))
    .mockResolvedValueOnce(response([video({ iso_639_1: 'en' })]));
  vi.stubGlobal('fetch', fetcher);
  expect((await loadTrailer({ tmdbId: 10 }, 'movies', 'fr-FR', new AbortController().signal))?.language).toBe('en');
  expect(fetcher.mock.calls.map(call => new URL(call[0]).searchParams.get('language'))).toEqual(['fr-FR', 'en-US']);
});
it('does not fetch English when a preferred trailer exists', async () => {
  const fetcher = vi.fn().mockResolvedValue(response([video()]));
  vi.stubGlobal('fetch', fetcher);
  await loadTrailer({ tmdbId: 10 }, 'movies', 'fr-FR', new AbortController().signal);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('resolves TVDB identifiers instead of using the native library identifier', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tv_results: [{ id: 90 }] })))
    .mockResolvedValueOnce(response([video({ iso_639_1: 'en' })]));
  vi.stubGlobal('fetch', fetcher);
  await loadTrailer({ tvdbId: 20 }, 'series', 'en-US', new AbortController().signal);
  expect(fetcher.mock.calls[0]![0]).toContain('/find/20?');
  expect(fetcher.mock.calls[0]![0]).toContain('external_source=tvdb_id');
  expect(fetcher.mock.calls[1]![0]).toContain('/tv/90/videos?');
});
it('does not guess ambiguous series or missing identities', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tv_results: [{ id: 1 }, { id: 2 }] })));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadTrailer({}, 'movies', 'en-US', new AbortController().signal)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await loadTrailer({ tvdbId: 20 }, 'series', 'en-US', new AbortController().signal)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('uses the actual original language before the English fallback', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 10, original_language: 'ja' })))
    .mockResolvedValueOnce(response([video({ iso_639_1: 'ja' })]));
  vi.stubGlobal('fetch', fetcher);
  expect((await loadTrailer({ tmdbId: 10 }, 'movies', 'original', new AbortController().signal))?.language).toBe('ja');
  expect(fetcher.mock.calls[1]![0]).toContain('language=ja');
});
it('reports TMDB failures rather than treating them as no trailer', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
  await expect(loadTrailer({ tmdbId: 10 }, 'movies', 'fr-FR', new AbortController().signal)).rejects.toThrow('Unable to load trailers');
});
it('aborts obsolete requests and never publishes their late result', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValue(response([video({ key: 'bcdefghijkl', iso_639_1: metadataLocale.value.slice(0, 2) })]));
  vi.stubGlobal('fetch', fetcher);
  const scope = effectScope();
  const item = ref({ tmdbId: 10 });
  const open = ref(true);
  const trailer = scope.run(() => useMediaTrailer(() => open.value, () => item.value, () => 'movies'))!;
  item.value = { tmdbId: 20 };
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
  await vi.waitFor(() => expect(trailer.video.value?.key).toBe('bcdefghijkl'));
  finish(response([video({ iso_639_1: metadataLocale.value.slice(0, 2) })]));
  await nextTick();
  expect(trailer.video.value?.key).toBe('bcdefghijkl');
  trailer.playerOpen.value = true;
  open.value = false;
  expect(trailer.playerOpen.value).toBe(false);
  expect(trailer.video.value).toBeNull();
  scope.stop();
});
it('does not refetch on an unrelated background refresh of the same media', async () => {
  const fetcher = vi.fn().mockResolvedValue(response([]));
  vi.stubGlobal('fetch', fetcher);
  const scope = effectScope();
  const item = ref({ tmdbId: 10, title: 'Old title' });
  scope.run(() => useMediaTrailer(() => true, () => item.value, () => 'movies'));
  item.value = { tmdbId: 10, title: 'Updated title' };
  await nextTick();
  expect(fetcher).toHaveBeenCalledTimes(1);
  scope.stop();
});
