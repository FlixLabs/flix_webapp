<script setup lang="ts">

import { ref, watch, computed, onMounted, toRaw } from 'vue';
import { useRoute } from 'vue-router';
import { useFlixStore } from '@/stores/flixStore';
import { usePersistentPreference, isString, isMediaType } from '@/composables/usePersistentPreference';
import { useMediaService } from '@/composables/useMediaService';
import { useCount } from '@/composables/useCount';
import { useLibraryFilters, savedLibraryFilters, saveLibraryFilters } from '@/composables/useLibraryFilters';
import LibraryFilters from '@/components/common/LibraryFilters.vue';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useMediaActions, canSearchItem } from '@/composables/useMediaActions';
import { useDialog } from '@/composables/useDialog';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import MediaDialog from '@/components/common/MediaDialog.vue';
import EpisodePanel from '@/components/common/EpisodePanel.vue';
import Loading from '@/components/common/Loading.vue';
import MediaBrowserToolbar from '@/components/common/MediaBrowserToolbar.vue';
import MediaBrowserResults from '@/components/common/MediaBrowserResults.vue';
import SeriesSizeField from '@/components/common/SeriesSizeField.vue';
import { useEpisodeSummary } from '@/composables/useEpisodeSummary';

const store = useFlixStore();
const route = useRoute();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

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

  fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();
      const currentConfig = getConfig(type);
      if (currentConfig.base_url !== base_url || currentConfig.api_key !== api_key) return;

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
              quality = item.movieFile.quality.quality.name;
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
          tvdbId: tvdbId,
          prependAvatar: item.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
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
          statistics: item.statistics
        });
      }

      items.sort((a, b) => a.title.localeCompare(b.title));

      if (type == 'movies') {
        movieItems.value = items;
      }
      if (type == 'series') {
        serieItems.value = items;
      }
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      if (type == 'movies') {
        resetIsLoadingMovie();
      }
      if (type == 'series') {
        resetIsLoadingSerie();
      }
    });
}

function getSerieEpisodes(serie_id: number) {
  const { base_url, api_key } = getConfig('series');

  serieDialog.value = true;
  isLoadingSerieEpisodes.value = true;

  serieEpisodes.value = [];

  fetch(base_url + '/api/v3/episode?includeEpisodeFile=true&apikey=' + api_key + '&seriesId=' + serie_id)
    .then(async (response) => {
      const json_data = await response.json();

      serieEpisodes.value = json_data.map((episode: any) => ({
        title: episode.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        airDate: episode.airDate,
        hasFile: episode.hasFile,
        relativePath: episode.episodeFile ? episode.episodeFile.relativePath : null,
        sizeOnDisk: episode.episodeFile ? episode.episodeFile.size : null,
        quality: episode.episodeFile ? episode.episodeFile.quality.quality.name : null
      }));

      isLoadingSerieEpisodes.value = false;
    })
    .catch((error) => {
      showErrorAlert(error);
    });
}

function handleMovieClick(movie_id: number) {
  const movie = movieItems.value.find(movie => movie.id === movie_id);
  if (movie) {
    selectedMovie.value = movie;
    movieDialog.value = true;
  }
}

function handleSerieClick(serie_id: number) {
  const serie = serieItems.value.find(serie => serie.id === serie_id);
  if (serie) {
    selectedSerie.value = serie;
    getSerieEpisodes(serie.id);
  }
}

watch([() => route.query.media, () => route.query.id, movieItems, serieItems], () => {
  const type = route.query.media;
  if (type !== 'movies' && type !== 'series') return;
  selected_view.value = type;
  const id = Number(route.query.id);
  if (!Number.isInteger(id) || id <= 0) return;
  if (type === 'movies' && selectedMovie.value?.id !== id) handleMovieClick(id);
  if (type === 'series' && selectedSerie.value?.id !== id) handleSerieClick(id);
}, { immediate: true });

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
      const json_data = JSON.parse(text);

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
});

watch(selectedInstance, () => {
  getContent('movies');
  getContent('series');
});
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
      v-model:page="activePage"
      :total-pages="selected_view === 'movies' ? movies_total_pages : series_total_pages"
      v-model:search="search"
      v-model:selected-view="selected_view"
      :total-movies="total_movies"
      :total-series="total_series"
    >
      <template #actions>
      <div
        v-if="(selected_view == 'movies' && filtered_movies.length > 0) || (selected_view == 'series' && filtered_series.length > 0)"
        class="d-flex justify-end align-center"
        >
        <v-btn-group>
          <v-btn
            color="primary"
            prepend-icon="mdi-file-export-outline"
            variant="outlined"
            @click="exportLibrary()"
            >
            Export
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-file-import-outline"
            variant="outlined"
            @click="switchShowFileUpload"
            >
            Import
          </v-btn>
        </v-btn-group>
      </div>
      </template>
    </MediaBrowserToolbar>
    <LibraryFilters v-model="filters" :statuses="statuses" :qualities="qualities" :years="years" />
    <v-row
      v-if="showFileUpload"
      >
      <v-col
        class="d-flex justify-end align-center"
        >
        <v-file-upload
          v-model="fileUpload"
          @update:model-value="handleFileUpload"
          accept=".json,application/json"
          density="compact"
          variant="compact"
          />
      </v-col>
    </v-row>
    <div
      v-if="selected_view == 'movies'"
      >
      <MediaBrowserResults
        :items="paginated_movies"
        :total="total_movies"
        :is-loading="isLoadingMovie"
        id-field="id"
        announcementName="Release"
        :showHasFile="true"
        empty-message="No movies found"
        @card-click="handleMovieClick"
      />
      <MediaDialog
        v-model="movieDialog"
        mediaType="Movie"
        :item="selectedMovie"
        announcementName="Release"
        :showSearch="canSearchItem('movies', selectedMovie)"
        :showAdd="false"
        :showRemove="!!selectedMovie"
        @search="searchContent('movies', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add=""
        @remove="openDeleteConfirmationDialog('movies', $event)"
      />
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
        @card-click="handleSerieClick"
      />
      <MediaDialog
        v-model="serieDialog"
        mediaType="Serie"
        :item="selectedSerie"
        announcementName="Premiere"
        :showSearch="canSearchItem('series', selectedSerie)"
        :showAdd="false"
        :showRemove="!!selectedSerie"
        @search="searchContent('series', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add=""
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
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
