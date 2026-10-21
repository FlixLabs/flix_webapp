import { ref, watch } from 'vue';
import { metadataLocale } from '@/i18n/preferences';
import { loadTrailer, type Trailer, type TrailerMedia } from './mediaTrailers';
import { useReadRequest } from './useReadRequest';

export function useMediaTrailer(open: () => boolean, item: () => TrailerMedia | null, kind: () => 'movies' | 'series') {
  const context = () => JSON.stringify([open(), item()?.tmdbId, item()?.tvdbId, kind(), metadataLocale.value]);
  const read = useReadRequest(context);
  const video = ref<Trailer | null>(null);
  const playerOpen = ref(false);

  async function refresh() {
    video.value = null;
    playerOpen.value = false;
    const media = item();
    if (!open() || !media) return;
    const request = read.begin();
    try {
      const result = await loadTrailer(media, kind(), metadataLocale.value, request.signal);
      if (request.isCurrent()) { video.value = result; request.success(); }
    } catch (error) {
      request.fail(error);
    } finally { request.finish(); }
  }
  watch(context, () => { void refresh(); }, { immediate: true, flush: 'sync' });
  return { video, playerOpen, state: read.state, refresh };
}
