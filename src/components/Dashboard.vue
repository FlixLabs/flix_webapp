<script setup lang="ts">

import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { rankSearchResults } from '@/composables/useSearchRelevance';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaService } from '@/composables/useMediaService';
import { useCount } from '@/composables/useCount';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useDashboardActions } from '@/composables/useDashboardActions';
import { useLibraryChecker } from '@/composables/useLibraryChecker';
import { useQualityProfiles } from '@/composables/useQualityProfiles';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import Loading from '@/components/common/Loading.vue';
import MediaList from '@/components/common/MediaList.vue';
import DashboardAttention from '@/components/common/DashboardAttention.vue';
import MediaTypeToggle from '@/components/common/MediaTypeToggle.vue';
import PageNavigation from '@/components/common/PageNavigation.vue';
import MediaDialog from '@/components/common/MediaDialog.vue';
import SeriesSizeField from '@/components/common/SeriesSizeField.vue';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: search, reset: resetSearch } = useResettable('');

const items_per_page = 4;
const movie_page = ref(1);
const serie_page = ref(1);
const mediaType = ref<'movies' | 'series'>(localStorage.getItem('dashboard_media_type') === 'series' ? 'series' : 'movies');
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
const detailDialog = ref(false);
const selectedItem = ref<any | null>(null);
const detailType = ref<'movies' | 'series'>('movies');
const detailActivator = ref<HTMLElement | null>(null);
const detailQualities = computed(() => detailType.value === 'movies' ? qualityMovieItems.value : qualitySerieItems.value);
function openDetails(type: 'movies' | 'series', item: any, activator: HTMLElement) {
  detailType.value = type;
  selectedItem.value = item;
  detailActivator.value = activator;
  detailDialog.value = true;
}
const activePage = computed({
  get: () => mediaType.value === 'movies' ? movie_page.value : serie_page.value,
  set: value => { (mediaType.value === 'movies' ? movie_page : serie_page).value = value; },
});

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieItems, reset: resetMovieItems } = useResettable<any[]>([]);
const { paginatedItems: paginated_movies } = usePagination(movieItems, movie_page, items_per_page);
const { total: total_movies } = useCount(movieItems);
const { isAlreadyInLibrary: checkMovies } = useLibraryChecker("movies", movieItems, showErrorAlert, useAPI);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieItems, reset: resetSerieItems } = useResettable<any[]>([]);
const { paginatedItems: paginated_series } = usePagination(serieItems, serie_page, items_per_page);
const { total: total_series } = useCount(serieItems);
const activeItems = computed(() => mediaType.value === 'movies' ? paginated_movies.value : paginated_series.value);
const activeTotal = computed(() => mediaType.value === 'movies' ? total_movies.value : total_series.value);
const activeLoading = computed(() => mediaType.value === 'movies' ? isLoadingMovie.value : isLoadingSerie.value);
watch(mediaType, value => localStorage.setItem('dashboard_media_type', value));
watch([mediaType, activePage], async () => {
  await nextTick();
  navigation.value?.scrollToStart();
});
const { isAlreadyInLibrary: checkSeries } = useLibraryChecker("series", serieItems, showErrorAlert, useAPI);

const { qualityMovieItems, qualitySerieItems, qualityMovie, qualitySerie, getQualityProfileList } = useQualityProfiles({
  useAPI, selectedInstanceData, showErrorAlert, initialQuality: 1
});

const { addItem, deleteItem, isPending } = useDashboardActions({
  useAPI, selectedInstanceData, showSuccessAlert, showErrorAlert, movies: movieItems, series: serieItems,
});

const { deleteConfirmationDialog, resetDeleteConfirmationDialog, openDeleteConfirmationDialog, confirmDelete } = useDeleteConfirmation({
  deleteItem,
});

const requests = { movies: { id: 0, controller: null as AbortController | null }, series: { id: 0, controller: null as AbortController | null } };
let searchTimer: ReturnType<typeof setTimeout> | undefined;

function cancelSearch() {
  clearTimeout(searchTimer);
  for (const request of Object.values(requests)) {
    request.id++;
    request.controller?.abort();
  }
  resetIsLoadingMovie();
  resetIsLoadingSerie();
}

function getContent(type: 'movies' | 'series') {
  const term = (search.value ?? '').trim();
  if (term.length < 3) return;
  const request = requests[type];
  request.controller?.abort();
  const id = ++request.id;
  request.controller = new AbortController();
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

  if (!base_url) {
    if (type === 'movies') resetIsLoadingMovie();
    else resetIsLoadingSerie();
    return;
  }

  const params = new URLSearchParams({ term, apikey: api_key });
  fetch(base_url + '/api/v3/' + url_type + '/lookup?' + params, { signal: request.controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Search failed (${response.status})`);
      const json_data = await response.json();
      if (id !== request.id) return;
      if (!Array.isArray(json_data)) throw new Error('Invalid search response');

      let items = [];
      for (let item of rankSearchResults(json_data, term)) {
        let title = item.title;
        const year_str = '(' + item.year + ')';

        if (title.includes(year_str)) {
          title = title.replace(year_str, '').trim();
        }

        const selectedQuality = (type === 'movies') ? qualityMovie.value : qualitySerie.value;

        items.push({
          id: item.id,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId,
          prependAvatar: item.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: title,
          year: item.year,
          overview: item.overview,
          certification: item.certification,
          runTime: item.runtime,
          release_date: type === 'movies' ? item.digitalRelease ?? item.inCinemas : item.firstAired,
          selected_quality: selectedQuality,
          already_in_library: false
        });
      }

      if (type == 'movies') {
        movieItems.value = items;
        checkMovies();
      }
      if (type == 'series') {
        serieItems.value = items;
        checkSeries();
      }
    })
    .catch(error => {
      if (id === request.id && error.name !== 'AbortError') showErrorAlert(error);
    })
    .finally(() => {
      if (id !== request.id) return;
      if (type == 'movies') {
        resetIsLoadingMovie();
      }
      if (type == 'series') {
        resetIsLoadingSerie();
      }
    });
}

function addToList(type: 'movies' | 'series', item: any) {
  item.qualityProfileId = item.selected_quality;
  addItem(type, item);
}


watch(search, (newValue) => {
  cancelSearch();
  movie_page.value = 1;
  serie_page.value = 1;
  resetMovieItems();
  resetSerieItems();
  if (newValue && newValue.trim().length >= 3) {
    localStorage.setItem("dashboard_search_" + window.location.href, newValue);

    searchTimer = setTimeout(() => {
      getContent('movies');
      getContent('series');
    }, 300);
  } else {
    localStorage.removeItem("dashboard_search_" + window.location.href);

    resetMovieItems();
    resetSerieItems();
  }
}, { flush: 'sync' });

onMounted(() => {
  if (localStorage.getItem('dashboard_search_' + window.location.href)) {
    search.value = localStorage.getItem('dashboard_search_' + window.location.href) ?? '';
  }

  getQualityProfileList('movies');
  getQualityProfileList('series');
});

watch(selectedInstance, () => {
  detailDialog.value = false;
  selectedItem.value = null;
  resetDeleteConfirmationDialog();
  cancelSearch();
  movie_page.value = 1;
  serie_page.value = 1;
  resetMovieItems();
  resetSerieItems();
  getQualityProfileList('movies');
  getQualityProfileList('series');
  getContent('movies');
  getContent('series');
}, { flush: 'sync' });

onBeforeUnmount(cancelSearch);
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
  <MediaDialog
    v-if="selectedItem"
    v-model="detailDialog"
    :media-type="detailType === 'movies' ? 'Movie' : 'Serie'"
    :item="selectedItem"
    :activator="detailActivator"
    :announcement-name="detailType === 'movies' ? 'Release' : 'Premiere'"
    :show-search="false"
    :show-add="!selectedItem.already_in_library"
    :show-remove="!!selectedItem.already_in_library"
    :show-file-details="!!selectedItem.already_in_library"
    :action-pending="isPending(detailType, selectedItem)"
    :add-disabled="!detailQualities.some(quality => quality.value === selectedItem.selected_quality)"
    @add="addToList(detailType, selectedItem)"
    @remove="openDeleteConfirmationDialog(detailType, selectedItem)"
  >
    <template #details>
      <v-row v-if="!selectedItem.already_in_library">
        <v-col>
          <v-select
            v-model="selectedItem.selected_quality"
            :items="detailQualities"
            label="Quality"
            variant="outlined"
            :disabled="isPending(detailType, selectedItem) || !detailQualities.length"
          />
          <p v-if="!detailQualities.length" class="text-caption text-warning">No quality profile available. Adding is unavailable.</p>
        </v-col>
      </v-row>
      <SeriesSizeField
        v-if="detailType === 'series' && selectedItem.already_in_library"
        :size="selectedItem.statistics?.sizeOnDisk ?? 0"
        :is-loading="false"
        :is-open="detailDialog"
      />
    </template>
  </MediaDialog>
  <v-container>
    <PageNavigation ref="navigation">
        <v-text-field
          v-model="search"
          label="Search"
          variant="outlined"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
        <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-3">
          <MediaTypeToggle v-model="mediaType" :total-movies="total_movies" :total-series="total_series" />
          <v-pagination
            v-if="activeTotal > items_per_page"
            v-model="activePage"
            :length="Math.ceil(activeTotal / items_per_page)"
            :total-visible="$vuetify.display.xs ? 3 : 5"
            density="compact"
            aria-label="Search results pages"
            rounded
          />
        </div>
    </PageNavigation>
    <DashboardAttention class="mt-4" />
    <section :aria-label="mediaType === 'movies' ? 'Movie results' : 'Series results'" :aria-busy="activeLoading">
      <MediaList
        :mediaType="mediaType"
        :paginated_items="activeItems"
        :qualityItems="mediaType === 'movies' ? qualityMovieItems : qualitySerieItems"
        :is-pending="isPending"
        @add="addToList"
        @remove="openDeleteConfirmationDialog"
        @details="openDetails"
      />
      <Loading :isLoading="activeLoading" sentence="Research in progress..." />
      <v-alert v-if="!activeItems.length && !activeLoading" type="info" class="mt-4">
        {{ !search || search.trim().length < 3 ? 'Enter at least 3 characters to search for movies and series.' : mediaType === 'movies' ? 'No movies found' : 'No series found' }}
      </v-alert>
    </section>
  </v-container>
</template>
