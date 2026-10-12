import { computed, onScopeDispose, ref, watch } from 'vue';
import { useMediaService, type MediaServiceOptions, type MediaType } from './useMediaService';
import { readApiJson, requireList, requireObject } from './apiResponse';

export interface MediaSettingsItem { id?: number; qualityProfileId?: number; selected_quality?: number; tags?: number[]; languageProfileId?: number; settingsNeedsRefresh?: boolean }
interface Settings { qualityProfileId: number; tags: number[]; languageProfileId?: number }
interface Choice { title: string; value: number }
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;
function tagIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.some(id => !positiveId(id))) throw new Error('Invalid tags');
  return [...new Set<number>(value)].sort((a, b) => a - b);
}
function settings(resource: Record<string, unknown>, id: number): Settings {
  if (resource.id !== id || !positiveId(resource.qualityProfileId)) throw new Error('Invalid media');
  return { qualityProfileId: resource.qualityProfileId, tags: tagIds(resource.tags),
    ...(positiveId(resource.languageProfileId) ? { languageProfileId: resource.languageProfileId } : {}) };
}
function choices(value: unknown, field: 'name' | 'label'): Choice[] {
  const records = requireList(value, 'settings', [field]);
  if (records.some(item => !positiveId(item.id) || !(item[field] as string).trim())) throw new Error('Invalid settings');
  return records.map(item => ({ title: item[field] as string, value: item.id as number }));
}
function sameTags(a: number[], b: number[]) { return JSON.stringify(tagIds(a)) === JSON.stringify(tagIds(b)); }

export function useMediaSettings(options: MediaServiceOptions) {
  const { getConfig } = useMediaService(options);
  const profiles = ref<Choice[]>([]); const tags = ref<Choice[]>([]); const languages = ref<Choice[]>([]);
  const qualityProfileId = ref<number | null>(null); const selectedTags = ref<number[]>([]); const languageProfileId = ref<number | null>(null);
  const languageEditable = ref(false); const loaded = ref(false); const pending = ref(false);
  const error = ref(''); const success = ref('');
  const baseline = ref<Settings | null>(null);
  let context = 0; let controller: AbortController | null = null;
  const dirty = computed(() => !!baseline.value && (qualityProfileId.value !== baseline.value.qualityProfileId
    || !sameTags(selectedTags.value, baseline.value.tags)
    || (languageEditable.value && languageProfileId.value !== baseline.value.languageProfileId)));
  function reset() {
    context++; controller?.abort(); baseline.value = null;
    profiles.value = []; tags.value = []; languages.value = [];
    qualityProfileId.value = null; selectedTags.value = []; languageProfileId.value = null;
    languageEditable.value = false; loaded.value = false; pending.value = false; error.value = ''; success.value = '';
  }
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], reset, { deep: true, flush: 'sync' });
  onScopeDispose(reset);

  async function run(type: MediaType, item: MediaSettingsItem, saving: boolean) {
    if (pending.value || !positiveId(item.id)) return false;
    if (saving && (!loaded.value || !baseline.value || !dirty.value || error.value || item.settingsNeedsRefresh)) return false;
    const original = baseline.value;
    const current = ++context; const abort = new AbortController(); controller = abort;
    const timer = setTimeout(() => abort.abort(), 15000);
    pending.value = true; error.value = ''; success.value = '';
    if (!saving) loaded.value = false;
    try {
      const config = getConfig(type);
      if (!config.base_url || !config.api_key) throw new Error('Missing service');
      const headers = { 'X-Api-Key': config.api_key, Accept: 'application/json', 'Content-Type': 'application/json' };
      const url = `${config.base_url}/api/v3/${type === 'movies' ? 'movie' : 'series'}/${item.id}`;
      const get = async (path: string) => readApiJson(await fetch(path, { headers, signal: abort.signal, cache: 'no-store' }));
      const resource = requireObject(await get(url), 'media');
      const fresh = settings(resource, item.id);
      if (current !== context) return false;
      if (!saving) {
        const qualityChoices = choices(await get(`${config.base_url}/api/v3/qualityprofile`), 'name');
        const tagChoices = choices(await get(`${config.base_url}/api/v3/tag`), 'label');
        let legacyLanguages: Choice[] = [];
        if (type === 'series') {
          let version = '';
          try {
            const status = requireObject(await get(`${config.base_url}/api/v3/system/status`));
            version = typeof status.version === 'string' ? status.version : '';
          } catch { /* Unknown service versions must not expose obsolete language controls. */ }
          if (/^3\./.test(version) && fresh.languageProfileId !== undefined) {
            legacyLanguages = choices(await get(`${config.base_url}/api/v3/languageprofile`), 'name');
            if (!legacyLanguages.some(choice => choice.value === fresh.languageProfileId)) throw new Error('Language profile missing');
          }
        }
        if (current !== context) return false;
        if (!qualityChoices.some(choice => choice.value === fresh.qualityProfileId)
          || fresh.tags.some(id => !tagChoices.some(choice => choice.value === id))) throw new Error('Settings missing');
        profiles.value = qualityChoices; tags.value = tagChoices; languages.value = legacyLanguages;
        languageEditable.value = legacyLanguages.length > 0;
        baseline.value = fresh; qualityProfileId.value = fresh.qualityProfileId;
        selectedTags.value = [...fresh.tags]; languageProfileId.value = fresh.languageProfileId ?? null;
        Object.assign(item, fresh); item.selected_quality = fresh.qualityProfileId; item.settingsNeedsRefresh = false;
        loaded.value = true;
        return true;
      }
      const requestedTags = tagIds(selectedTags.value);
      if (!positiveId(qualityProfileId.value) || !profiles.value.some(choice => choice.value === qualityProfileId.value)
        || requestedTags.some(id => !tags.value.some(choice => choice.value === id))
        || (languageEditable.value && !languages.value.some(choice => choice.value === languageProfileId.value))) throw new Error('Invalid selection');
      const patch: Partial<Settings> = {};
      if (qualityProfileId.value !== original!.qualityProfileId) {
        if (fresh.qualityProfileId !== original!.qualityProfileId) throw new Error('Concurrent quality change');
        patch.qualityProfileId = qualityProfileId.value;
      }
      if (!sameTags(requestedTags, original!.tags)) {
        if (!sameTags(fresh.tags, original!.tags)) throw new Error('Concurrent tag change');
        patch.tags = requestedTags;
      }
      if (languageEditable.value && languageProfileId.value !== original!.languageProfileId) {
        if (fresh.languageProfileId !== original!.languageProfileId || !positiveId(languageProfileId.value)) throw new Error('Concurrent language change');
        patch.languageProfileId = languageProfileId.value;
      }
      item.settingsNeedsRefresh = true;
      const response = await fetch(`${url}?moveFiles=false`, { method: 'PUT', headers, body: JSON.stringify({ ...resource, ...patch }), signal: abort.signal });
      if (current !== context) return false;
      if (!response.ok) throw new Error('Update failed');
      const updated = settings(requireObject(await get(url), 'media'), item.id);
      if (current !== context) return false;
      if ((patch.qualityProfileId !== undefined && updated.qualityProfileId !== patch.qualityProfileId)
        || (patch.tags !== undefined && !sameTags(updated.tags, patch.tags))
        || (patch.languageProfileId !== undefined && updated.languageProfileId !== patch.languageProfileId)) throw new Error('Settings not confirmed');
      baseline.value = updated; qualityProfileId.value = updated.qualityProfileId; selectedTags.value = [...updated.tags]; languageProfileId.value = updated.languageProfileId ?? null;
      Object.assign(item, updated); item.selected_quality = updated.qualityProfileId; item.settingsNeedsRefresh = false;
      success.value = 'Media settings saved.';
      return true;
    } catch {
      if (current === context) error.value = saving
        ? item.settingsNeedsRefresh
          ? 'Unable to confirm settings. Reload settings before trying again; the service may have applied the update.'
          : 'Unable to save settings. They may have changed in the service. Reload settings before trying again.'
        : 'Unable to load media settings. Check the service and retry.';
      return false;
    } finally {
      clearTimeout(timer);
      if (current === context) pending.value = false;
    }
  }
  return { profiles, tags, languages, qualityProfileId, selectedTags, languageProfileId, languageEditable, loaded, pending, error, success, dirty,
    reset, load: (type: MediaType, item: MediaSettingsItem) => run(type, item, false), save: (type: MediaType, item: MediaSettingsItem) => run(type, item, true) };
}
