import { useSheetRefreshSchedule } from './useSheetRefreshSchedule';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { useReadRequest } from './useReadRequest';
import { readApiJson, requireObject } from './apiResponse';
import { mediaFileFields } from './mediaFileDetails';
import { monitoringFields } from './useMediaMonitoring';

type Media = Record<string, unknown>;
export function useMediaSheetRefresh(options: MediaServiceOptions & {
  open: () => boolean;
  type: () => MediaType;
  item: () => Media | null;
  native: () => boolean;
  blocked: () => boolean;
  refreshed: () => void;
}) {
  const { getConfig, serviceContext } = useMediaService(options);
  const context = () => [options.open(), options.type(), options.item(), options.item()?.id, options.native(), serviceContext()];
  const read = useReadRequest(context);
  const eligible = () => options.open() && options.native() && Number.isSafeInteger(options.item()?.id) && Number(options.item()?.id) > 0;
  const schedule = useSheetRefreshSchedule({ context, enabled: eligible, refresh });
  async function refresh() {
    if (!eligible() || options.blocked() || !schedule.active() || read.state.loading) return;
    const target = options.item()!;
    const type = options.type();
    const config = getConfig(type);
    const request = read.begin();
    try {
      if (!config.base_url || !config.api_key) throw new Error('Select a configured instance to refresh this media.');
      const response = await fetch(`${config.base_url}/api/v3/${type === 'movies' ? 'movie' : 'series'}/${target.id}`, {
        headers: { 'X-Api-Key': config.api_key }, signal: request.signal, cache: 'no-store',
      });
      if (response.status === 404) throw new Error('This media is no longer available in the selected library.');
      const resource = requireObject<Media>(await readApiJson(response), 'media');
      const identity = type === 'movies' ? 'tmdbId' : 'tvdbId';
      if (resource.id !== target.id || typeof resource.title !== 'string'
        || (Number(target[identity]) > 0 && resource[identity] !== target[identity])) throw new Error('Media identity changed. Reopen the sheet from your library.');
      if (!request.isCurrent() || !eligible() || options.item() !== target || options.blocked()) return;
      // Keep the same object and editable selections: neither scroll nor forms should reset.
      const patch: Media = {};
      for (const field of ['hasFile', 'status', 'statistics', 'isAvailable']) patch[field] = resource[field];
      Object.assign(patch, monitoringFields(resource));
      if (type === 'movies') Object.assign(patch, mediaFileFields(resource.movieFile));
      Object.assign(target, patch);
      request.success();
      options.refreshed();
    } catch (error) { request.fail(error); }
    finally { request.finish(); }
  }
  return { state: read.state, refresh };
}
