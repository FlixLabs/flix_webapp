import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaServiceConfig, type MediaType } from './useMediaService';
import type { MediaActionItem } from './useMediaActions';

export interface Release {
  guid: string;
  indexerId: number;
  title: string;
  indexer?: string;
  size?: number;
  quality?: { quality?: { name?: string } };
  languages?: { name: string }[];
  customFormatScore?: number;
  seeders?: number;
  protocol?: string;
  approved?: boolean;
  rejected?: boolean;
  temporarilyRejected?: boolean;
  rejections?: string[];
  downloadAllowed?: boolean;
}

interface Episode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

interface SearchContext {
  type: MediaType;
  item: MediaActionItem;
  config: MediaServiceConfig;
}

export function useReleaseSearch(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const dialog = ref(false);
  const releases = ref<Release[]>([]);
  const episodes = ref<Episode[]>([]);
  const season = ref<number | null>(null);
  const episodeId = ref<number | null>(null);
  const isSearching = ref(false);
  const isLoadingEpisodes = ref(false);
  const isGrabbing = ref(false);
  const hasSearched = ref(false);
  const error = ref('');
  const seasons = computed(() => [...new Set(episodes.value.map(e => e.seasonNumber))].sort((a, b) => a - b));
  const seasonEpisodes = computed(() => episodes.value.filter(e => e.seasonNumber === season.value).sort((a, b) => a.episodeNumber - b.episodeNumber));
  let context: SearchContext | null = null;
  let controller: AbortController | null = null;
  let requestId = 0;

  function clearResults() {
    requestId++;
    controller?.abort();
    controller = null;
    releases.value = [];
    isSearching.value = false;
    hasSearched.value = false;
    error.value = '';
  }

  function close() {
    context = null;
    dialog.value = false;
    clearResults();
    episodes.value = [];
    season.value = null;
    episodeId.value = null;
    isLoadingEpisodes.value = false;
  }

  function validContext(active: SearchContext) {
    const current = getConfig(active.type);
    return context === active && current.base_url === active.config.base_url && current.api_key === active.config.api_key;
  }

  async function open(type: MediaType, item: MediaActionItem) {
    close();
    const config = getConfig(type);
    if (!Number.isInteger(item.id) || (item.id ?? 0) <= 0 || item.already_in_library === false || !config.base_url || !config.api_key) {
      error.value = 'Interactive search requires media already present in the library and a configured service.';
      dialog.value = true;
      return;
    }
    const active: SearchContext = { type, item: { ...item }, config: { ...config } };
    context = active;
    dialog.value = true;
    if (type === 'movies') {
      await search();
      return;
    }
    const abort = new AbortController();
    controller = abort;
    isLoadingEpisodes.value = true;
    try {
      const response = await fetch(`${config.base_url}/api/v3/episode?seriesId=${item.id}`, {
        headers: { 'X-Api-Key': config.api_key }, signal: abort.signal,
      });
      if (!response.ok) throw new Error('Unable to load episodes');
      const data: Episode[] = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid episode response');
      if (!validContext(active) || abort.signal.aborted) return;
      episodes.value = data;
      season.value = seasons.value.find(s => s > 0) ?? seasons.value[0] ?? null;
    } catch {
      if (validContext(active) && !abort.signal.aborted) error.value = 'Unable to load seasons and episodes. Please try again.';
    } finally {
      if (validContext(active)) isLoadingEpisodes.value = false;
    }
    if (validContext(active) && season.value !== null) await search();
  }

  async function search() {
    const active = context;
    if (!active || !validContext(active) || isGrabbing.value) return;
    clearResults();
    const params = new URLSearchParams();
    if (active.type === 'movies') params.set('movieId', String(active.item.id));
    else if (episodeId.value !== null) {
      if (!seasonEpisodes.value.some(e => e.id === episodeId.value)) {
        error.value = 'Please select an episode from this season.';
        return;
      }
      params.set('episodeId', String(episodeId.value));
    } else if (season.value !== null && seasons.value.includes(season.value)) {
      params.set('seriesId', String(active.item.id));
      params.set('seasonNumber', String(season.value));
    } else {
      error.value = 'Please select a season or an episode.';
      return;
    }
    const id = ++requestId;
    const abort = new AbortController();
    controller = abort;
    isSearching.value = true;
    try {
      const response = await fetch(`${active.config.base_url}/api/v3/release?${params}`, {
        headers: { 'X-Api-Key': active.config.api_key }, signal: abort.signal,
      });
      if (!response.ok) throw new Error('Release search failed');
      const data: Release[] = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid release response');
      if (!validContext(active) || id !== requestId || abort.signal.aborted) return;
      releases.value = data;
      hasSearched.value = true;
    } catch {
      if (validContext(active) && id === requestId && !abort.signal.aborted) error.value = 'Unable to search releases. Please try again.';
    } finally {
      if (id === requestId) isSearching.value = false;
    }
  }

  async function grab(release: Release): Promise<boolean> {
    const active = context;
    if (isGrabbing.value || !active || !validContext(active)) return false;
    if (isSearching.value || !releases.value.some(r => r.guid === release.guid && r.indexerId === release.indexerId) || !release.guid || !Number.isInteger(release.indexerId) || release.indexerId <= 0 || release.downloadAllowed === false) {
      error.value = 'This release cannot be downloaded. Please search again.';
      return false;
    }
    isGrabbing.value = true;
    error.value = '';
    const payload = {
      guid: release.guid, indexerId: release.indexerId,
      ...(active.type === 'movies' ? { movieId: active.item.id } : { seriesId: active.item.id, ...(episodeId.value !== null ? { episodeId: episodeId.value } : {}) }),
    };
    try {
      const response = await fetch(`${active.config.base_url}/api/v3/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': active.config.api_key },
        body: JSON.stringify(payload),
      });
      if (!validContext(active)) return false;
      if (!response.ok) {
        error.value = response.status === 404
          ? 'The release is no longer cached by the service. Search again before downloading.'
          : 'Unable to download this release. Check the indexer and download client, then try again.';
        return false;
      }
      return true;
    } catch {
      if (validContext(active)) error.value = 'Unable to download this release. Please try again.';
      return false;
    } finally {
      isGrabbing.value = false;
    }
  }

  watch(season, () => {
    if (context?.type === 'series') {
      episodeId.value = null;
      clearResults();
      if (!isLoadingEpisodes.value && season.value !== null) void search();
    }
  }, { flush: 'sync' });
  watch(episodeId, () => { if (context?.type === 'series') clearResults(); }, { flush: 'sync' });
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], close, { flush: 'sync' });
  if (getCurrentScope()) onScopeDispose(close);

  return { dialog, releases, episodes, seasons, seasonEpisodes, season, episodeId, isSearching, isLoadingEpisodes, isGrabbing, hasSearched, error, open, close, search, grab };
}
