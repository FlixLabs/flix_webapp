import { ref, shallowRef, watch } from 'vue';
import { readApiJson, requireObject, optionalList } from './apiResponse';
import { mediaFileFields } from './mediaFileDetails';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { useReadRequest } from './useReadRequest';

const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export function downloadMediaId(type: MediaType, record: Record<string, unknown>): number | undefined {
  const nested = record[type === 'movies' ? 'movie' : 'series'];
  const direct = record[type === 'movies' ? 'movieId' : 'seriesId'];
  if (positiveId(direct)) return direct;
  const id = nested && typeof nested === 'object' ? (nested as Record<string, unknown>).id : undefined;
  return positiveId(id) ? id : undefined;
}
export function downloadMediaTitle(type: MediaType, record: Record<string, unknown>): string | undefined {
  const nested = record[type === 'movies' ? 'movie' : 'series'];
  if (!nested || typeof nested !== 'object') return undefined;
  const media = nested as Record<string, unknown>;
  return positiveId(media.id) && media.id === downloadMediaId(type, record)
    && typeof media.title === 'string' && media.title.trim() ? media.title.trim() : undefined;
}

export function useDownloadMediaSheet(options: MediaServiceOptions) {
  const { getConfig, serviceContext } = useMediaService(options);
  const dialog = ref(false);
  const type = ref<MediaType>('movies');
  const mediaId = ref(0);
  const item = ref<Record<string, unknown> | null>(null);
  const activator = shallowRef<HTMLElement | null>(null);
  const read = useReadRequest(() => [serviceContext(), type.value, mediaId.value]);
  watch(dialog, open => { if (!open) read.cancel(); }, { flush: 'sync' });
  watch(serviceContext, () => { dialog.value = false; read.reset(); }, { flush: 'sync' });

  async function load() {
    if (!dialog.value || !positiveId(mediaId.value)) return;
    const expectedId = mediaId.value;
    const expectedType = type.value;
    const config = getConfig(expectedType);
    const request = read.begin();
    try {
      if (!config.base_url || !config.api_key) throw new Error('Select a configured instance to open this media.');
      const response = await fetch(`${config.base_url}/api/v3/${expectedType === 'movies' ? 'movie' : 'series'}/${expectedId}`, {
        headers: { 'X-Api-Key': config.api_key }, signal: request.signal, cache: 'no-store',
      });
      if (response.status === 404) throw new Error('This media is no longer available in the selected library.');
      const resource = requireObject(await readApiJson(response), 'media');
      if (resource.id !== expectedId || typeof resource.title !== 'string' || !resource.title.trim()) throw new Error('Invalid media response. Please try again.');
      if (!request.isCurrent() || !dialog.value) return;
      const file = expectedType === 'movies' ? mediaFileFields(resource.movieFile) : {};
      item.value = { ...resource, ...file, runTime: resource.runtime,
        prependAvatar: optionalList<{ coverType?: string; remoteUrl?: string }>(resource.images, 'images').find(image => image.coverType === 'poster')?.remoteUrl,
        release_date: expectedType === 'movies' ? resource.digitalRelease ?? resource.inCinemas : resource.firstAired };
      request.success();
    } catch (error) { request.fail(error); }
    finally { request.finish(); }
  }

  function open(mediaType: MediaType, record: { mediaId?: unknown; title?: string }, element: HTMLElement) {
    if (!positiveId(record.mediaId)) return;
    read.reset();
    type.value = mediaType;
    mediaId.value = record.mediaId;
    item.value = { title: record.title || 'Media' };
    activator.value = element;
    dialog.value = true;
    void load();
  }
  return { dialog, type, item, activator, state: read.state, open, retry: load };
}
