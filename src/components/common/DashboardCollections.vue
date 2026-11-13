<script setup lang="ts">
import { computed, defineAsyncComponent, onScopeDispose, ref, watch } from 'vue';
import { metadataContext, metadataLocale, region, t } from '@/i18n';
import { readApiJson, requireList } from '@/composables/apiResponse';
import { useReadRequest } from '@/composables/useReadRequest';
import { useDashboardActions } from '@/composables/useDashboardActions';
import { useQualityProfiles } from '@/composables/useQualityProfiles';
import { lookupCatalogMovie, prepareCatalogMovies } from '@/composables/catalogCollectionMovies';
import type { CollectionDownloadMovie } from '@/composables/useCollectionDownloads';
import { parseCollectionDetail, parseCollectionSearch, type CatalogCollection, type CatalogCollectionMovie } from '@/composables/tmdbCollections';
import type { LibraryMovie } from '@/composables/collections';
import { useMediaService } from '@/composables/useMediaService';
import { useFlixStore } from '@/stores/flixStore';
import { useDialogActivator } from '@/composables/useDialogActivator';
import MediaCard from './MediaCard.vue';
import MediaTag from './MediaTag.vue';
import { availabilityBadge } from '@/composables/mediaBadges';
import MediaSummary from './MediaSummary.vue';
import MediaDialog from './MediaDialog.vue';
import DialogSheet from './DialogSheet.vue';
import Loading from './Loading.vue';
import ReadFeedback from './ReadFeedback.vue';

const props = defineProps<{ search: string; page: number; active: boolean; context: string }>();
const emit = defineEmits<{ results: [total: number | undefined, pages: number]; 'search-movie': [id: number]; 'library-updated': [] }>();
const store = useFlixStore();
const options = { useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'), selectedInstanceData: computed(() => store.selectedInstanceData) };
const { getConfig } = useMediaService(options);
const items = ref<CatalogCollection[]>([]);
const searchRead = useReadRequest(() => [props.search.trim(), props.page, props.context, metadataContext.value]);
const libraryRead = useReadRequest(() => props.context);
const movies = ref<LibraryMovie[]>([]);
const selected = ref<(CatalogCollection & { members: CatalogCollectionMovie[] }) | null>(null);
const dialog = ref(false);
const activator = useDialogActivator(() => dialog.value);
const memberPage = ref(1);
const detailRead = useReadRequest(() => [selected.value?.tmdbId, props.context, metadataContext.value]);
interface PreviewMovie extends CatalogCollectionMovie { id?: number; already_in_library?: boolean; selected_quality?: number; status?: string; hasFile?: boolean; runTime?: number }
const previewItems = ref<PreviewMovie[]>([]);
const preview = computed(() => previewItems.value[0] ?? null);
const previewOpen = ref(false);
const previewRead = useReadRequest(() => [props.context, preview.value?.tmdbId, previewOpen.value]);
const actionMessage = ref('');
const actionFailed = ref(false);
const adding = ref(false);
let writeTarget: PreviewMovie | null = null;
let writeContext = '';
const writeVisible = () => previewOpen.value && preview.value === writeTarget && props.context === writeContext;
const { addItem } = useDashboardActions({ ...options, movies: previewItems, series: ref([]),
  showSuccessAlert: message => { if (writeVisible()) { actionMessage.value = message; actionFailed.value = false; } },
  showErrorAlert: message => { if (writeVisible()) { actionMessage.value = message; actionFailed.value = true; } },
});
const { qualityMovieItems, qualityMovie, qualityReads, getQualityProfileList } = useQualityProfiles({ ...options, showErrorAlert: () => {} });
const sourceUnavailable = computed(() => !detailRead.state.hasData || detailRead.state.loading || !!detailRead.state.error
  || !libraryRead.state.hasData || libraryRead.state.loading || !!libraryRead.state.error);
const addDisabled = computed(() => sourceUnavailable.value || adding.value || actionFailed.value
  || !previewRead.state.hasData || previewRead.state.loading || !!previewRead.state.error
  || !qualityReads.movies.state.hasData || qualityReads.movies.state.loading || !!qualityReads.movies.state.error
  || !getConfig('movies').root_folder_path || !qualityMovieItems.value.some(profile => profile.value === preview.value?.selected_quality));
const bulkRead = useReadRequest(() => [props.context, selected.value?.tmdbId, dialog.value], 60000);
const bulkCandidates = ref<CollectionDownloadMovie[]>([]);
const bulkDialog = ref(false);
const bulkReady = ref(false);
const bulkActivator = useDialogActivator(() => bulkDialog.value);
const CollectionDownloadDialog = defineAsyncComponent(() => import('./CollectionDownloadDialog.vue'));
const members = computed(() => selected.value?.members ?? []);
const memberPages = computed(() => Math.ceil(members.value.length / 8));
const displayedMembers = computed(() => members.value.slice((memberPage.value - 1) * 8, memberPage.value * 8));
const libraryIndex = computed(() => new Map(movies.value.map(movie => [movie.tmdbId, movie])));
const newMembers = computed(() => members.value.filter(movie => !libraryIndex.value.has(movie.tmdbId)));
const pending = computed(() => props.search.trim().length >= 3 && !searchRead.state.hasData && !searchRead.state.error);
let timer: ReturnType<typeof setTimeout> | undefined;

function tmdbUrl(path: string) {
  const base = import.meta.env.VITE_TMDB_BASE_URL?.replace(/\/$/, '');
  const key = import.meta.env.VITE_TMDB_API_KEY;
  if (!base || !key) throw new Error('Collection search requires TMDB configuration.');
  const url = new URL(`${base}/${path}`);
  url.search = new URLSearchParams({ api_key: key, language: metadataLocale.value === 'original' ? 'en-US' : metadataLocale.value, region: region.value }).toString();
  return url;
}
async function tmdb(url: URL, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load collections from TMDB.');
  return readApiJson(response);
}
async function load() {
  clearTimeout(timer);
  if (!props.active || props.search.trim().length < 3) return;
  const request = searchRead.begin();
  try {
    const url = tmdbUrl('search/collection');
    url.searchParams.set('query', props.search.trim()); url.searchParams.set('page', String(props.page));
    url.searchParams.set('include_adult', 'false');
    const data = parseCollectionSearch(await tmdb(url, request.signal));
    if (!request.isCurrent()) return;
    items.value = data.items; emit('results', data.total, data.pages); request.success();
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
async function loadLibrary() {
  const request = libraryRead.begin();
  try {
    const config = getConfig('movies');
    if (!config.base_url) throw new Error('Select a configured instance to load collections.');
    const url = `${config.base_url}/api/v3/movie?${new URLSearchParams({ apikey: config.api_key })}`;
    const response = await fetch(url, { signal: request.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to load movie library.');
    const data = requireList<LibraryMovie>(await readApiJson(response), 'movie library', ['title']);
    if (data.some(movie => !Number.isSafeInteger(movie.id) || movie.id <= 0
      || movie.tmdbId != null && (!Number.isSafeInteger(movie.tmdbId) || movie.tmdbId <= 0))) throw new Error('Invalid library response. Please try again.');
    if (!request.isCurrent()) return;
    movies.value = data; request.success();
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
async function loadDetail() {
  if (!selected.value || !dialog.value) return;
  const id = selected.value.tmdbId;
  const request = detailRead.begin();
  try {
    const data = parseCollectionDetail(await tmdb(tmdbUrl(`collection/${id}`), request.signal), id);
    if (!request.isCurrent()) return;
    selected.value = data; request.success();
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
async function open(item: CatalogCollection, addCollection = false) {
  if (adding.value || bulkRead.state.loading) return;
  detailRead.reset();
  selected.value = { ...item, members: [] }; memberPage.value = 1; dialog.value = true;
  await Promise.all([loadDetail(), loadLibrary()]);
  if (addCollection && dialog.value && selected.value?.tmdbId === item.tmdbId) await prepareBulk();
}
function fileState(id: number) {
  if (!libraryRead.state.hasData || libraryRead.state.error) return undefined;
  const local = libraryIndex.value.get(id);
  return local ? local.hasFile : false;
}
function searchMovie() {
  if (!preview.value || adding.value) return;
  const id = preview.value.tmdbId;
  previewOpen.value = false; dialog.value = false;
  emit('search-movie', id);
}
async function openMovie(movie: CatalogCollectionMovie) {
  if (adding.value) return;
  actionMessage.value = ''; actionFailed.value = false;
  previewItems.value = [{ ...movie, selected_quality: qualityMovie.value ?? undefined }];
  previewOpen.value = true;
  const target = preview.value;
  const context = props.context;
  void getQualityProfileList('movies').then(() => {
    if (props.context === context && previewOpen.value && preview.value === target && target && !target.selected_quality) target.selected_quality = qualityMovie.value ?? undefined;
  });
  await verifyMovie();
}
async function verifyMovie() {
  if (!preview.value || !previewOpen.value || adding.value) return;
  const target = preview.value;
  const request = previewRead.begin();
  try {
    await loadLibrary();
    if (!request.isCurrent() || libraryRead.state.error || !libraryRead.state.hasData) return;
    const local = libraryIndex.value.get(target.tmdbId);
    if (local) Object.assign(target, { id: local.id, already_in_library: true, hasFile: local.hasFile });
    else {
      const native = await lookupCatalogMovie(getConfig('movies'), target.tmdbId, request.signal);
      if (!request.isCurrent()) return;
      Object.assign(target, { ...native, id: undefined, already_in_library: false, hasFile: false, runTime: native.runtime });
    }
    actionFailed.value = false; actionMessage.value = ''; request.success();
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
async function addMovie() {
  const target = preview.value;
  if (!target || target.already_in_library || addDisabled.value) return;
  adding.value = true;
  const context = props.context;
  const root = getConfig('movies').root_folder_path;
  writeTarget = target; writeContext = context;
  try {
    await loadLibrary();
    if (context !== props.context || preview.value !== target || !previewOpen.value || libraryRead.state.error || !libraryRead.state.hasData) return;
    if (!root || root !== getConfig('movies').root_folder_path || qualityReads.movies.state.error
      || qualityReads.movies.state.loading || !qualityMovieItems.value.some(profile => profile.value === target.selected_quality)) return;
    const local = libraryIndex.value.get(target.tmdbId);
    if (local) { Object.assign(target, { id: local.id, already_in_library: true, hasFile: local.hasFile }); return; }
    await addItem('movies', target);
    if (context !== props.context || !target.already_in_library || !target.id) return;
    movies.value = [...movies.value.filter(movie => movie.tmdbId !== target.tmdbId), { id: target.id, tmdbId: target.tmdbId, title: target.title, hasFile: false }];
    emit('library-updated');
  } finally { adding.value = false; writeTarget = null; }
}
async function prepareBulk() {
  if (!dialog.value || sourceUnavailable.value || adding.value || bulkRead.state.loading) return;
  const request = bulkRead.begin();
  try {
    await loadLibrary();
    if (!request.isCurrent() || libraryRead.state.error || !libraryRead.state.hasData) return;
    const candidates = await prepareCatalogMovies(getConfig('movies'), members.value, movies.value, request.signal);
    if (!request.isCurrent()) return;
    bulkCandidates.value = candidates; request.success();
    if (candidates.length) { bulkReady.value = true; bulkDialog.value = true; }
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
function bulkRefreshed() { void loadLibrary(); emit('library-updated'); }
watch(() => [props.search.trim(), props.page, props.context, metadataContext.value], (value, previous) => {
  clearTimeout(timer); searchRead.reset(); items.value = [];
  if (!previous || value[0] !== previous[0] || value[2] !== previous[2] || value[3] !== previous[3]) emit('results', undefined, 0);
  dialog.value = false; previewOpen.value = false; bulkDialog.value = false;
  if (props.active && props.search.trim().length >= 3) timer = setTimeout(() => { void load(); }, 300);
}, { immediate: true, flush: 'sync' });
watch(() => props.active, value => {
  if (value && !searchRead.state.hasData && !searchRead.state.loading) void load();
  if (!value) { clearTimeout(timer); searchRead.cancel(); dialog.value = false; previewOpen.value = false; bulkDialog.value = false; }
});
watch(() => props.context, () => { movies.value = []; libraryRead.reset(); }, { flush: 'sync' });
watch(dialog, value => { if (!value) { detailRead.cancel(); bulkRead.reset(); bulkDialog.value = false; previewOpen.value = false; } });
onScopeDispose(() => clearTimeout(timer));
</script>

<template>
  <section :aria-label="t('Collection results')" :aria-busy="searchRead.state.loading || pending">
    <ReadFeedback :state="searchRead.state" :label="t('Collections')" @retry="load" />
    <Loading :is-loading="searchRead.state.loading || pending" :sentence="t('Research in progress...')" />
    <v-row class="mt-2" density="compact">
      <v-col v-for="item in items" :key="item.tmdbId" cols="6" sm="4" md="3" lg="2" class="mb-4">
        <div class="collection-result">
          <MediaCard :title="item.title" :poster="item.poster" media-type="collection" :subtitle="t('Collection')" :label="t('Open collection {p0}', { p0: item.title })" @open="open(item)" />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-plus" :disabled="adding || bulkRead.state.loading" :aria-label="t('Add collection {p0}', { p0: item.title })" @click="open(item, true)">{{ t('Add') }}</v-btn>
        </div>
      </v-col>
    </v-row>
    <v-alert v-if="!items.length && !pending && !searchRead.state.loading && !searchRead.state.error" type="info" class="mt-4">{{ search.trim().length < 3 ? t('Enter at least 3 characters to search for collections.') : t('No collections match your search') }}</v-alert>
  </section>
  <DialogSheet v-if="selected" v-model="dialog" :title="t('Collection')" :label="t('Collection: {p0}', { p0: selected.title })" :context="`${selected.tmdbId}:${memberPage}:${members.length}`" :activator="activator" :close-label="t('Close collection')" @closed="!dialog && (selected = null)">
    <ReadFeedback :state="detailRead.state" :active="dialog" :label="t('Collections')" @retry="loadDetail" />
    <ReadFeedback :state="libraryRead.state" :active="dialog" :label="t('Movie library')" @retry="loadLibrary" />
    <ReadFeedback :state="bulkRead.state" :active="dialog" :label="t('Missing movies')" @retry="prepareBulk" />
    <Loading :is-loading="detailRead.state.loading" :sentence="t('Loading collections...')" />
    <MediaSummary :item="selected" media-type="collection" :facts="detailRead.state.hasData ? [{ label: 'Movies', value: members.length }] : []" />
    <v-alert v-if="detailRead.state.hasData && !members.length" type="info" class="mt-3">{{ t('No films reported for this collection') }}</v-alert>
    <section v-if="members.length" class="mt-6" :aria-label="t('Collection movies')">
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3"><h3 class="text-subtitle-1 font-weight-bold">{{ t('Movies') }}</h3><span class="text-caption text-medium-emphasis">{{ t('Release year order') }}</span></div>
      <v-row density="compact">
        <v-col v-for="movie in displayedMembers" :key="movie.tmdbId" cols="6" sm="4" md="3">
          <MediaCard :title="movie.title" :poster="movie.poster" :subtitle="movie.year || t('Unknown year')" :label="t('View {p0}', { p0: movie.title })" :disabled="adding || bulkRead.state.loading" @open="openMovie(movie)">
            <MediaTag :badge="availabilityBadge(fileState(movie.tmdbId))" />
          </MediaCard>
        </v-col>
      </v-row>
    </section>
    <template #navigation><v-pagination v-if="memberPages > 1" v-model="memberPage" :length="memberPages" :total-visible="$vuetify.display.xs ? 3 : 5" density="compact" :aria-label="t('Collection film pages')" /></template>
    <template #actions><v-btn v-if="newMembers.length" color="primary" prepend-icon="mdi-plus" :loading="bulkRead.state.loading" :disabled="sourceUnavailable || adding || bulkRead.state.loading" @click="prepareBulk">{{ t('Add movies ({p0})', { p0: newMembers.length }) }}</v-btn></template>
    <v-alert v-if="!sourceUnavailable && members.length && !newMembers.length" type="info" class="mt-3">{{ t('All collection movies are already in your library.') }}</v-alert>
  </DialogSheet>
  <CollectionDownloadDialog v-if="bulkReady" v-model="bulkDialog" :movies="bulkCandidates" :context="`${context}:${selected?.tmdbId}`" :disabled="sourceUnavailable || !dialog" :activator="bulkActivator" @refresh="bulkRefreshed" />
  <MediaDialog v-model="previewOpen" :item="preview" media-type="Movie" announcement-name="Release" :show-search="false" :show-add="!preview?.already_in_library" :show-remove="false" :show-file-details="false" :action-pending="adding" :read-only="addDisabled" :add-disabled="addDisabled" @add="addMovie">
    <template #status>
      <ReadFeedback :state="previewRead.state" :active="previewOpen" :label="t('Movie details')" :disabled="adding" @retry="verifyMovie" />
      <ReadFeedback :state="libraryRead.state" :active="previewOpen" :label="t('Movie library')" :disabled="adding" @retry="verifyMovie" />
      <v-alert v-if="actionMessage" :type="actionFailed ? 'error' : 'success'" role="status" class="mb-3">{{ t(actionMessage) }}<v-btn v-if="actionFailed" variant="text" :disabled="adding" @click="verifyMovie">{{ t('Retry') }}</v-btn></v-alert>
      <v-alert v-if="preview?.already_in_library" type="info" class="mb-3">{{ t('This movie is already in your library.') }}</v-alert>
    </template>
    <template #details>
      <template v-if="preview && !preview.already_in_library">
        <ReadFeedback :state="qualityReads.movies.state" :active="previewOpen" :label="t('Quality profiles')" :disabled="adding" @retry="getQualityProfileList('movies')" />
        <v-select v-model="preview.selected_quality" :items="qualityMovieItems" :label="t('Quality')" variant="outlined" :disabled="adding || !qualityMovieItems.length" />
        <p v-if="!qualityMovieItems.length" class="text-caption text-warning">{{ t('No quality profile available. Adding is unavailable.') }}</p>
      </template>
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-magnify" :disabled="adding" @click="searchMovie">{{ t('Search this movie') }}</v-btn>
    </template>
  </MediaDialog>
</template>

<style scoped>
.collection-result { display: flex; flex-direction: column; gap: 8px; height: 100%; }
.collection-result :deep(.media-card) { flex: 1; height: auto; }
.collection-result > .v-btn { min-width: 0; }
</style>
