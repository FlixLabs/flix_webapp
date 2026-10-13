<script setup lang="ts">
import { mediaFileFields } from '@/composables/mediaFileDetails';
import { monitoringFields } from '@/composables/useMediaMonitoring';
import { readApiJson, requireList, optionalList } from '@/composables/apiResponse';
import { useReadRequest } from '@/composables/useReadRequest';
import { libraryCollections, parseCollections, type MovieCollection } from '@/composables/collections';
import ReadFeedback from '@/components/common/ReadFeedback.vue';


import { ref, watch, computed, onMounted, toRaw, defineAsyncComponent } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { usePersistentPreference, isString, isMediaType } from '@/composables/usePersistentPreference';
import { useMediaService } from '@/composables/useMediaService';
import { useCount } from '@/composables/useCount';
import { useLibraryFilters, savedLibraryFilters, saveLibraryFilters } from '@/composables/useLibraryFilters';
import LibraryFilters from '@/components/common/LibraryFilters.vue';
import LibraryBulkActions from '@/components/common/LibraryBulkActions.vue';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useMediaActions, canSearchItem } from '@/composables/useMediaActions';
import { useDialog } from '@/composables/useDialog';
import { useMediaSheetRoute } from '@/composables/useMediaSheetRoute';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import MediaDialog from '@/components/common/MediaDialog.vue';
import EpisodePanel from '@/components/common/EpisodePanel.vue';
import Loading from '@/components/common/Loading.vue';
import MediaBrowserToolbar from '@/components/common/MediaBrowserToolbar.vue';
import MediaBrowserResults from '@/components/common/MediaBrowserResults.vue';
import SeriesSizeField from '@/components/common/SeriesSizeField.vue';
import { useEpisodeSummary } from '@/composables/useEpisodeSummary';

const LibraryCollections = defineAsyncComponent(() => import('./common/LibraryCollections.vue'));
const showCollections = ref(false);
const collectionSearch = ref<string | null>('');
const collectionPage = ref(1);
const requestedCollection = ref<{ tmdbId: number }>();
function browseCollections(id?: number) {
  if (bulkPending.value) return;
  selected_view.value = 'movies';
  selectionMode.value = false;
  requestedCollection.value = id ? { tmdbId: id } : undefined;
  showCollections.value = true;
  resetMovieDialog();
}

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig, serviceContext } = useMediaService({ useAPI, selectedInstanceData });

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const search = usePersistentPreference('library.search', '', isString);

const selected_view = usePersistentPreference('library.view', 'movies', isMediaType);
const filters = ref(savedLibraryFilters());
const activeItems = computed(() => selected_view.value === 'movies' ? movieItems.value : serieItems.value);
const statuses = computed(() => [...new Set<string>(activeItems.value.map(item => item.status).filter(Boolean))].sort());
const qualities = computed(() => [...new Set<string>(activeItems.value.map(item => item.quality).filter(Boolean))].sort());
const years = computed(() => [...new Set<number>(activeItems.value.map(item => item.year).filter(Boolean))].sort((a, b) => b - a));

const items_per_page = 12;
const movie_page = ref(1);
const serie_page = ref(1);
const activePage = computed({
  get: () => selected_view.value === 'movies' ? movie_page.value : serie_page.value,
  set: value => { (selected_view.value === 'movies' ? movie_page : serie_page).value = value; },
});
const browserSearch = computed({
  get: () => showCollections.value ? collectionSearch.value : search.value,
  set: value => { if (showCollections.value) collectionSearch.value = value; else search.value = value ?? ''; },
});
const browserPage = computed({
  get: () => showCollections.value ? collectionPage.value : activePage.value,
  set: value => { if (showCollections.value) collectionPage.value = value; else activePage.value = value; },
});
watch(collectionSearch, () => { collectionPage.value = 1; });

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieItems, reset: resetMovieItems } = useResettable<any[]>([]);
const { state: selectedMovie, reset: resetSelectedMovie } = useResettable<any | null>(null);
const { dialog: movieDialog, reset: resetMovieDialog } = useDialog();
const { filteredItems: filtered_movies } = useLibraryFilters(movieItems, search, filters);
const movies_total_pages = computed(() =>
  Math.ceil(filtered_movies.value.length / items_per_page)
);
const { paginatedItems: paginated_movies } = usePagination(filtered_movies, movie_page, items_per_page);
const { total: total_movies } = useCount(filtered_movies);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieItems, reset: resetSerieItems } = useResettable<any[]>([]);
const { state: selectedSerie, reset: resetSelectedSerie } = useResettable<any | null>(null);
const { dialog: serieDialog, reset: resetSerieDialog } = useDialog();
const { state: serieEpisodes, reset: resetSerieEpisodes } = useResettable<any[]>([]);
const { filteredItems: filtered_series } = useLibraryFilters(serieItems, search, filters);
const series_total_pages = computed(() =>
  Math.ceil(filtered_series.value.length / items_per_page)
);
const { paginatedItems: paginated_series } = usePagination(filtered_series, serie_page, items_per_page);
const { total: total_series } = useCount(filtered_series);
const { state: isLoadingSerieEpisodes, reset: resetIsLoadingSerieEpisodes } = useResettable(false);
const contentLoaded = ref({ movies: false, series: false });
const contentRequests = { movies: 0, series: 0 };
const libraryReads = {
  movies: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('movies').base_url, getConfig('movies').api_key]),
  series: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('series').base_url, getConfig('series').api_key]),
};
const collectionSource = ref<MovieCollection[]>([]);
const collectionRead = useReadRequest(serviceContext);
const connectedCollections = computed(() => libraryCollections(collectionSource.value, movieItems.value));
const totalCollections = computed(() => collectionRead.state.hasData && libraryReads.movies.state.hasData
  ? connectedCollections.value.length : undefined);
const collectionPages = computed(() => Math.ceil(connectedCollections.value.filter(collection =>
  collection.title.toLocaleLowerCase().includes((collectionSearch.value ?? '').trim().toLocaleLowerCase())).length / items_per_page));
async function loadCollections() {
  const request = collectionRead.begin();
  try {
    const config = getConfig('movies');
    if (!config.base_url) throw new Error('Select a configured instance to load collections.');
    const data = parseCollections(await readApiJson(await fetch(`${config.base_url}/api/v3/collection?apikey=${encodeURIComponent(config.api_key)}`, { signal: request.signal, cache: 'no-store' })));
    if (!request.isCurrent()) return;
    collectionSource.value = data;
    request.success();
  } catch (error) { request.fail(error); }
  finally { request.finish(); }
}
for (const type of ['movies', 'series'] as const) {
  watch(() => libraryReads[type].state.hasData, valid => {
    if (!valid) contentLoaded.value = { ...contentLoaded.value, [type]: false };
  }, { flush: 'sync' });
  watch(() => libraryReads[type].state.loading, loading => {
    (type === 'movies' ? isLoadingMovie : isLoadingSerie).value = loading;
  }, { flush: 'sync' });
  watch(() => libraryReads[type].state.error, error => {
    if (error && !libraryReads[type].state.hasData) (type === 'movies' ? movieItems : serieItems).value = [];
  }, { flush: 'sync' });
}
let episodeRequest = 0;
const episodeRead = useReadRequest(() => [serieDialog.value, selectedSerie.value?.id, serviceContext()]);
watch(() => episodeRead.state.loading, value => { isLoadingSerieEpisodes.value = value; }, { flush: 'sync' });

const selectionMode = ref(false);
const selectedIds = ref<number[]>([]);
const bulkPending = ref(false);
const visibleSelectionItems = computed(() => selected_view.value === 'movies' ? filtered_movies.value : filtered_series.value);
const currentSelectionPage = computed(() => selected_view.value === 'movies' ? paginated_movies.value : paginated_series.value);
const selectionLoading = computed(() => libraryReads[selected_view.value].state.loading || !contentLoaded.value[selected_view.value]);
function toggleSelection(id: number) {
  if (bulkPending.value || selectionLoading.value || !Number.isInteger(id) || id <= 0) return;
  selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter(value => value !== id) : [...selectedIds.value, id];
}
function selectPage() {
  if (bulkPending.value || selectionLoading.value) return;
  selectedIds.value = [...new Set([...selectedIds.value, ...currentSelectionPage.value.map(item => item.id).filter(id => Number.isInteger(id) && id > 0)])];
}
watch([search, filters, selected_view, selectedInstanceData, useAPI], () => { selectedIds.value = []; }, { deep: true, flush: 'sync' });
watch(selectionMode, () => { selectedIds.value = []; });

const { state: showFileUpload, reset: resetShowFileUpload } = useResettable(false);
const { state: fileUpload, reset: resetFileUpload } = useResettable<File | undefined>(undefined);

const { addItem, deleteItem, searchItem } = useMediaActions({
  useAPI, selectedInstanceData, showSuccessAlert, showErrorAlert, refreshContent: getContent
});

const { deleteConfirmationDialog, resetDeleteConfirmationDialog, openDeleteConfirmationDialog, confirmDelete } = useDeleteConfirmation({
  deleteItem,
  selectedItem: type => type === 'movies' ? selectedMovie.value : selectedSerie.value,
  onConfirm: () => { resetMovieDialog(); resetSerieDialog(); },
});

function getContent(type: 'movies' | 'series') {
  const request = ++contentRequests[type];
  const read = libraryReads[type].begin();
  contentLoaded.value = { ...contentLoaded.value, [type]: false };
  let base_url = '';
  let api_key = '';
  let url_type = '';

  if (type == 'movies') {
    isLoadingMovie.value = true;
    ({ base_url, api_key } = getConfig('movies'));
    url_type = 'movie';
  }
  if (type == 'series') {
    isLoadingSerie.value = true;
    ({ base_url, api_key } = getConfig('series'));
    url_type = 'series';
  }

  return fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key, { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      const json_data: any = requireList(await readApiJson(response), 'library', ['title']);
      if (json_data.some((item: any) => !Number.isSafeInteger(item.id) || item.id <= 0)) throw new Error('Invalid library response. Please try again.');
      const currentConfig = getConfig(type);
      if (!read.isCurrent() || request !== contentRequests[type] || currentConfig.base_url !== base_url || currentConfig.api_key !== api_key) return;

      let items = [];
      for (let item of json_data) {
        let tmdbId = null;
        let tvdbId = null;
        let runTime = null;
        let quality = null;
        let relativePath = null;

        if (type == 'movies') {
          tmdbId = item.tmdbId;
          if (item.movieFile) {
            relativePath = item.movieFile.relativePath;

            if (item.movieFile.mediaInfo) {
              runTime = item.movieFile.mediaInfo.runTime;
            }

            if (item.movieFile.quality) {
              quality = item.movieFile.quality.quality?.name;
            }
          }
        }
        if (type == 'series') {
          tvdbId = item.tvdbId;
          runTime = item.runtime;
        }

        let title = item.title;
        const year_str = '(' + item.year + ')';

        if (title.includes(year_str)) {
          title = title.replace(year_str, '').trim();
        }

        items.push({
          id: item.id,
          tmdbId: tmdbId,
          collection: type === 'movies' ? item.collection : undefined,
          tvdbId: tvdbId,
          prependAvatar: optionalList(item.images, 'images').find((img: any) => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: title,
          certification: item.certification,
          year: item.year,
          added: item.added,
          sizeOnDisk: item.sizeOnDisk ?? item.movieFile?.size,
          runTime: runTime,
          overview: item.overview,
          hasFile: item.hasFile,
          status: item.status,
          qualityProfileId: item.qualityProfileId,
          quality: quality,
          relativePath: relativePath,
          ...(type === 'movies' && item.movieFile ? mediaFileFields(item.movieFile) : {}),
          statistics: item.statistics,
          ...monitoringFields(item)
        });
      }

      items.sort((a, b) => a.title.localeCompare(b.title));

      if (type == 'movies') {
        movieItems.value = items;
      }
      if (type == 'series') {
        serieItems.value = items;
      }
      contentLoaded.value = { ...contentLoaded.value, [type]: true };
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

function getSerieEpisodes(serie_id: number) {
  if (!selectedSerie.value || selectedSerie.value.id !== serie_id) return;
  const request = ++episodeRequest;
  const { base_url, api_key } = getConfig('series');

  serieDialog.value = true;
  const read = episodeRead.begin();
  isLoadingSerieEpisodes.value = true;

  if (!episodeRead.state.hasData) serieEpisodes.value = [];

  return fetch(base_url + '/api/v3/episode?includeEpisodeFile=true&apikey=' + api_key + '&seriesId=' + serie_id, { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      const json_data: any = requireList(await readApiJson(response), 'library', ['title']);
      const currentConfig = getConfig('series');
      if (!read.isCurrent() || request !== episodeRequest || !serieDialog.value || selectedSerie.value?.id !== serie_id || currentConfig.base_url !== base_url || currentConfig.api_key !== api_key) return;

      serieEpisodes.value = json_data.map((episode: any) => ({
        title: episode.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        airDate: episode.airDate,
        hasFile: episode.hasFile,
        ...mediaFileFields(episode.episodeFile)
      }));
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(read.finish);
}

function openMovie(movie_id: number) {
  const movie = movieItems.value.find(movie => movie.id === movie_id);
  if (movie) {
    selectedMovie.value = movie;
    movieDialog.value = true;
  }
}

function openSerie(serie_id: number) {
  const serie = serieItems.value.find(serie => serie.id === serie_id);
  if (serie) {
    if (selectedSerie.value?.id === serie_id && serieDialog.value) return;
    selectedSerie.value = serie;
    getSerieEpisodes(serie.id);
  }
}

const { openLink } = useMediaSheetRoute({
  useAPI, view: selected_view, items: { movies: movieItems, series: serieItems },
  dialogs: { movies: movieDialog, series: serieDialog }, loaded: contentLoaded,
  open: (type, id) => { if (type === 'movies') openMovie(id); else openSerie(id); },
  showError: showErrorAlert,
});
function handleMovieClick(id: number) { openLink('movies', id); }
function handleSerieClick(id: number) { openLink('series', id); }

const { grouped_episodes, totalSerieSizeOnDisk } = useEpisodeSummary(serieEpisodes);


function searchContent(type: 'movies' | 'series', item: any) {
  searchItem(type, item);
  resetMovieDialog();
  resetSerieDialog();
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours())+ '-' + p(d.getMinutes());
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportLibrary() {
  const exportData = selected_view.value === 'movies'
    ? filtered_movies.value
    : filtered_series.value;

  const rawData = toRaw(exportData);
  const json = JSON.stringify(rawData, null, 2);
  const file = 'flix_' + selected_view.value + '_' + timestamp() + '.json';
  downloadBlob(json, file, 'application/json;charset=utf-8;');
  showSuccessAlert('JSON export started : ' + rawData.length + ' ' + selected_view.value);
}

function switchShowFileUpload() {
  if (!showFileUpload.value) {
    showFileUpload.value = true;
  } else {
    showFileUpload.value = false;
  }
}

async function handleFileUpload() {
  const file = fileUpload.value as File | null;
  if (!file) return;

  const lname = file.name.toLowerCase();
  const match = /(movies|series)/.exec(lname);
  if (!match) {
    showErrorAlert('Filename must contain "movies" or "series".');
    return;
  }

  const selected = (match[1] as 'movies' | 'series');

  showSuccessAlert('JSON import started : ' + file.name);

  try {
    const text = await file.text();

    try {
      const json_data: any = requireList(JSON.parse(text), 'import file');

      for (let item of json_data) {
        addItem(selected, item);
      }

      showSuccessAlert('JSON import finished : ' + json_data.length + ' ' + selected);
    } catch {
      showErrorAlert('JSON read error : ' + text);
    }
  } catch (e) {
    showErrorAlert('JSON read error : ' + e);
  }

  resetFileUpload();
  resetShowFileUpload();
}

watch([search, filters], () => { movie_page.value = 1; serie_page.value = 1; }, { deep: true });
watch(filters, saveLibraryFilters, { deep: true });

watch(selected_view, () => {
  filters.value.status = null;
  filters.value.quality = null;
  movie_page.value = 1;
  serie_page.value = 1;
});

onMounted(() => {
  getContent('movies');
  getContent('series');
  void loadCollections();
});

watch(serviceContext, () => {
  collectionSource.value = [];
  resetMovieDialog(); resetSerieDialog(); resetSelectedMovie(); resetSelectedSerie();
  episodeRequest++;
  getContent('movies');
  getContent('series');
  void loadCollections();
}, { flush: 'sync' });
</script>

<template>
  <Alert
    :alert="alert"
    @update:alert="alert = $event"
    />
  <DeleteConfirmationDialog
    v-model="deleteConfirmationDialog"
    @confirm="confirmDelete"
    @cancel="resetDeleteConfirmationDialog"
    />
  <v-container>
    <MediaBrowserToolbar
      show-collections
      :total-collections="totalCollections"
      :collections-disabled="bulkPending"
      v-model:collections="showCollections"
      @collections-open="browseCollections()"
      v-model:page="browserPage"
      :total-pages="showCollections ? collectionPages : selected_view === 'movies' ? movies_total_pages : series_total_pages"
      v-model:search="browserSearch"
      v-model:selected-view="selected_view"
      :total-movies="libraryReads.movies.state.hasData ? total_movies : undefined"
      :total-series="libraryReads.series.state.hasData ? total_series : undefined"
    >
      <template v-if="!showCollections" #actions>
      <div
        v-if="selectionMode || (selected_view == 'movies' && filtered_movies.length > 0) || (selected_view == 'series' && filtered_series.length > 0)"
        class="library-tools d-flex justify-end align-center flex-nowrap ga-2"
        >
        <v-btn variant="outlined" color="primary" :active="selectionMode" :aria-pressed="selectionMode" :disabled="bulkPending || (!selectionMode && selectionLoading)" @click="selectionMode = !selectionMode">
          Select media
        </v-btn>
        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" color="primary" variant="outlined" append-icon="mdi-chevron-down" :disabled="bulkPending">Library tools</v-btn>
          </template>
          <v-list role="menu" density="compact">
            <v-list-item role="menuitem" title="Export" prepend-icon="mdi-file-export-outline" :disabled="!visibleSelectionItems.length" @click="exportLibrary()" />
            <v-list-item role="menuitem" title="Import" prepend-icon="mdi-file-import-outline" @click="switchShowFileUpload" />
          </v-list>
        </v-menu>
      </div>
      </template>
    </MediaBrowserToolbar>
    <LibraryCollections v-if="showCollections" v-model:page="collectionPage" :search="collectionSearch" :movies="movieItems" :source="collectionSource" :collection-state="collectionRead.state" :context="serviceContext()" :library-state="libraryReads.movies.state" :initial-collection="requestedCollection" @retry-collections="loadCollections" @open-movie="handleMovieClick" @retry-library="getContent('movies')" />
    <ReadFeedback v-if="!showCollections" :state="libraryReads[selected_view].state" :label="selected_view === 'movies' ? 'Movie library' : 'Series library'" :disabled="bulkPending" @retry="getContent(selected_view)" />
    <LibraryFilters v-show="!showCollections" v-model="filters" :statuses="statuses" :qualities="qualities" :years="years" />
    <LibraryBulkActions
      v-if="selectionMode"
      v-model:selected-ids="selectedIds"
      :items="visibleSelectionItems"
      :page-selection-disabled="selectionLoading || !currentSelectionPage.length"
      :type="selected_view"
      :use-api="useAPI"
      :instance="selectedInstanceData"
      @busy="bulkPending = $event"
      @select-page="selectPage"
      @refresh="getContent(selected_view)"
    />
    <v-row
      v-if="showFileUpload && !showCollections"
      >
      <v-col
        class="d-flex justify-end align-center"
        >
        <v-file-upload
          v-model="fileUpload"
          @update:model-value="handleFileUpload"
          accept=".json,application/json"
          :disabled="bulkPending"
          density="compact"
          variant="compact"
          />
      </v-col>
    </v-row>
    <div
      v-if="selected_view == 'movies'"
      >
      <MediaBrowserResults
        v-if="!showCollections"
        :items="paginated_movies"
        :total="total_movies"
        :is-loading="isLoadingMovie"
        id-field="id"
        announcementName="Release"
        :showHasFile="true"
        empty-message="No movies found"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        :selection-disabled="bulkPending || !contentLoaded.movies"
        :actions-disabled="!contentLoaded.movies"
        :unavailable="!!libraryReads.movies.state.error"
        @toggle-selection="toggleSelection"
        @card-click="handleMovieClick"
      />
      <MediaDialog
        v-model="movieDialog"
        :read-only="!contentLoaded.movies"
        mediaType="Movie"
        :item="selectedMovie"
        :navigation-items="showCollections ? [] : paginated_movies"
        :navigation-pending="isLoadingMovie"
        @navigate="handleMovieClick($event.id)"
        announcementName="Release"
        :showSearch="canSearchItem('movies', selectedMovie)"
        :showAdd="false"
        :showRemove="!!selectedMovie"
        @search="searchContent('movies', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add=""
        @remove="openDeleteConfirmationDialog('movies', $event)"
      >
        <template #metadata>
          <div v-if="Number.isSafeInteger(selectedMovie?.collection?.tmdbId) && selectedMovie.collection.tmdbId > 0" class="d-flex justify-center mt-3">
            <v-btn class="collection-link" max-width="100%" variant="tonal" color="primary" prepend-icon="mdi-filmstrip-box-multiple" :title="`Collection: ${selectedMovie.collection.title || 'View saga'}`" :disabled="!contentLoaded.movies" @click="browseCollections(selectedMovie.collection.tmdbId)">
              <span class="text-truncate">Collection: {{ selectedMovie.collection.title || 'View saga' }}</span>
            </v-btn>
          </div>
        </template>
      </MediaDialog>
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
      <MediaBrowserResults
        :items="paginated_series"
        :total="total_series"
        :is-loading="isLoadingSerie"
        id-field="id"
        announcementName="Premiere"
        :showHasFile="false"
        empty-message="No series found"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        :selection-disabled="bulkPending || !contentLoaded.series"
        :actions-disabled="!contentLoaded.series"
        :unavailable="!!libraryReads.series.state.error"
        @toggle-selection="toggleSelection"
        @card-click="handleSerieClick"
      />
      <MediaDialog
        v-model="serieDialog"
        :read-only="!contentLoaded.series || !!episodeRead.state.error"
        mediaType="Serie"
        :item="selectedSerie"
        :navigation-items="paginated_series"
        :navigation-pending="isLoadingSerie || isLoadingSerieEpisodes"
        @navigate="handleSerieClick($event.id)"
        announcementName="Premiere"
        :showSearch="canSearchItem('series', selectedSerie)"
        :showAdd="false"
        :showRemove="!!selectedSerie"
        @search="searchContent('series', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add=""
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
        <template #status>
          <ReadFeedback :state="episodeRead.state" label="Series episodes" @retry="getSerieEpisodes(selectedSerie?.id)" />
        </template>
        <template
          #details
          >
          <SeriesSizeField
            :size="totalSerieSizeOnDisk"
            :is-loading="isLoadingSerieEpisodes"
            :is-open="serieDialog"
          />
        </template>
        <template
          #episodes
          >
          <EpisodePanel
            :grouped_episodes="grouped_episodes"
            :isLoading="isLoadingSerieEpisodes"
            :hasTotalSize="totalSerieSizeOnDisk > 0"
            >
            <template
              #loading
              >
              <Loading
                :isLoading="isLoadingSerieEpisodes"
                sentence="Research in progress..."
                />
            </template>
          </EpisodePanel>
        </template>
      </MediaDialog>
    </div>
  </v-container>
</template>
