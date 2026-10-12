import { onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { readApiJson, requireObject } from './apiResponse';

export interface MonitoredSeason { seasonNumber: number; monitored: boolean }
export interface MonitoredMedia { id?: number; monitored?: boolean; seasons?: MonitoredSeason[]; monitoringNeedsRefresh?: boolean }

export function monitoringFields(value: MonitoredMedia) {
  return {
    monitored: typeof value.monitored === 'boolean' ? value.monitored : undefined,
    seasons: Array.isArray(value.seasons) ? value.seasons.filter(season =>
      Number.isInteger(season?.seasonNumber) && season.seasonNumber >= 0 && typeof season.monitored === 'boolean'
    ).map(season => ({ seasonNumber: season.seasonNumber, monitored: season.monitored })) : [],
  };
}

export function useMediaMonitoring(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const pending = ref(false);
  const error = ref('');
  let context = 0;
  let controller: AbortController | null = null;
  function reset() {
    context++;
    controller?.abort();
    pending.value = false;
    error.value = '';
  }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], reset, { deep: true, flush: 'sync' });
  onScopeDispose(reset);

  async function refreshMonitoring(type: MediaType, item: MonitoredMedia) {
    if (pending.value || !Number.isInteger(item.id) || !item.id || item.id <= 0) return false;
    const config = getConfig(type);
    if (!config.base_url || !config.api_key) {
      error.value = 'Select a configured instance before reloading monitoring.';
      return false;
    }
    const current = context;
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    pending.value = true;
    try {
      const resource = requireObject<MonitoredMedia>(await readApiJson(await fetch(
        config.base_url + '/api/v3/' + (type === 'movies' ? 'movie' : 'series') + '/' + item.id,
        { headers: { 'X-Api-Key': config.api_key, Accept: 'application/json' }, signal: abort.signal, cache: 'no-store' },
      )), 'media');
      if (current !== context) return false;
      if (resource.id !== item.id || typeof resource.monitored !== 'boolean') throw new Error('Invalid media');
      Object.assign(item, monitoringFields(resource));
      item.monitoringNeedsRefresh = false;
      error.value = '';
      return true;
    } catch {
      if (current === context) error.value = 'Unable to reload monitoring. Check the service and retry.';
      return false;
    } finally {
      clearTimeout(timeout);
      if (current === context) pending.value = false;
    }
  }

  async function setMonitoring(type: MediaType, item: MonitoredMedia, monitored: boolean, seasonNumber?: number) {
    if (pending.value) return false;
    if (!Number.isInteger(item.id) || !item.id || item.id <= 0 || typeof item.monitored !== 'boolean'
      || (seasonNumber !== undefined && (type !== 'series' || !Number.isInteger(seasonNumber) || seasonNumber < 0))) {
      error.value = 'Monitoring is unavailable for this media.';
      return false;
    }
    const config = getConfig(type);
    if (!config.base_url || !config.api_key) {
      error.value = 'Select a configured instance before changing monitoring.';
      return false;
    }
    const current = context;
    const abort = new AbortController();
    controller = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    pending.value = true;
    error.value = '';
    const url = config.base_url + '/api/v3/' + (type === 'movies' ? 'movie' : 'series') + '/' + item.id;
    const headers = { 'X-Api-Key': config.api_key, Accept: 'application/json', 'Content-Type': 'application/json' };
    try {
      const resource = requireObject<MonitoredMedia & Record<string, unknown>>(await readApiJson(await fetch(url, { headers, signal: abort.signal, cache: 'no-store' })), 'media');
      if (current !== context) return false;
      if (resource.id !== item.id || typeof resource.monitored !== 'boolean') throw new Error('Invalid media');
      if (seasonNumber === undefined) resource.monitored = monitored;
      else {
        if (!resource.monitored) throw new Error('Series is not monitored');
        if (!Array.isArray(resource.seasons) || !resource.seasons.some(season => season?.seasonNumber === seasonNumber)) throw new Error('Season missing');
        resource.seasons = resource.seasons.map(season => season.seasonNumber === seasonNumber ? { ...season, monitored } : season);
      }
      item.monitoringNeedsRefresh = true;
      const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(resource), signal: abort.signal });
      if (current !== context) return false;
      if (!response.ok) throw new Error('Monitoring update failed');
      // Read the persisted state rather than assuming the requested state was applied.
      const updated = requireObject<MonitoredMedia>(await readApiJson(await fetch(url, { headers, signal: abort.signal, cache: 'no-store' })), 'media');
      if (current !== context) return false;
      if (updated.id !== item.id || typeof updated.monitored !== 'boolean') throw new Error('Invalid media');
      Object.assign(item, monitoringFields(updated));
      item.monitoringNeedsRefresh = false;
      const applied = seasonNumber === undefined ? updated.monitored
        : item.seasons?.find(season => season.seasonNumber === seasonNumber)?.monitored;
      if (applied !== monitored) throw new Error('State not applied');
      return true;
    } catch {
      if (current === context) error.value = 'Unable to confirm monitoring. Reload monitoring before trying again.';
      return false;
    } finally {
      clearTimeout(timeout);
      if (current === context) pending.value = false;
    }
  }
  return { pending, error, reset, setMonitoring, refreshMonitoring };
}
