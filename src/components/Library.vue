<script setup lang="ts">

import { ref, watch, computed, onMounted, toRaw } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useDialog } from '@/composables/useDialog';
import { useDeleteItem } from '@/composables/useDeleteItem';
import { useAddItem } from '@/composables/useAddItem';
import { useSearchItem } from '@/composables/useSearchItem';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import MediaDialog from '@/components/common/MediaDialog.vue';
import EpisodePanel from '@/components/common/EpisodePanel.vue';
import Loading from '@/components/common/Loading.vue';
import MediaGrid from '@/components/common/MediaGrid.vue';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const {
  deleteConfirmationDialog,
  resetDeleteConfirmationDialog,
  itemToDelete,
  resetItemToDelete
} = useDeleteConfirmation();

const { state: search, reset: resetSearch } = useResettable('');

const selected_view = ref<'movies' | 'series'>('movies');

const items_per_page = 12;
const movie_page = ref(1);
const serie_page = ref(1);

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieItems, reset: resetMovieItems } = useResettable<any[]>([]);
const { state: selectedMovie, reset: resetSelectedMovie } = useResettable<any | null>(null);
const { dialog: movieDialog, reset: resetMovieDialog } = useDialog();
const { filteredItems: filtered_movies } = useFilteredItems(movieItems, search);
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
const { filteredItems: filtered_series } = useFilteredItems(serieItems, search);
const series_total_pages = computed(() =>
  Math.ceil(filtered_series.value.length / items_per_page)
);
const { paginatedItems: paginated_series } = usePagination(filtered_series, serie_page, items_per_page);
const { total: total_series } = useCount(filtered_series);
const { state: isLoadingSerieEpisodes, reset: resetIsLoadingSerieEpisodes } = useResettable(false);

const { deleteItem } = useDeleteItem({
  useAPI,
  selectedInstanceData,
  showSuccessAlert,
  showErrorAlert,
  refreshContent: getContent
});

const { addItem } = useAddItem({
  useAPI,
  selectedInstanceData,
  showSuccessAlert,
  showErrorAlert,
  refreshContent: getContent
});

const { searchItem } = useSearchItem({
  useAPI,
  selectedInstanceData,
  showSuccessAlert,
  showErrorAlert,
  refreshContent: getContent
});

const { state: showFileUpload, reset: resetShowFileUpload } = useResettable(false);
const { state: fileUpload, reset: resetFileUpload } = useResettable<File | undefined>(undefined);

function getContent(type: 'movies' | 'series') {
  let base_url = '';
  let api_key = '';
  let url_type = '';

  if (type == 'movies') {
    isLoadingMovie.value = true;
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.radarr?.base_url ?? '';
      api_key = sid?.radarr?.api_key ?? '';
    }
    url_type = 'movie';
  }
  if (type == 'series') {
    isLoadingSerie.value = true;
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.sonarr?.base_url ?? '';
      api_key = sid?.sonarr?.api_key ?? '';
    }
    url_type = 'series';
  }

  fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

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
  let base_url = '';
  let api_key = '';

  serieDialog.value = true;
  isLoadingSerieEpisodes.value = true;

  serieEpisodes.value = [];

  if (!useAPI.value) {
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  } else {
    const sid = selectedInstanceData.value as any;
    base_url = sid?.sonarr?.base_url ?? '';
    api_key = sid?.sonarr?.api_key ?? '';
  }

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

const grouped_episodes = computed(() => {
  return serieEpisodes.value.reduce((acc, episode) => {
    if (!acc[episode.season]) {
      acc[episode.season] = [];
    }
    acc[episode.season].push(episode);
    return acc;
  }, {} as Record<number, any[]>);
});

const totalSerieSizeOnDisk = computed(() => {
  return serieEpisodes.value.reduce((sum: number, episode: any) => {
    const episodeSize = typeof episode?.sizeOnDisk === 'number' ? episode.sizeOnDisk : 0;
    return sum + episodeSize;
  }, 0);
});

function formatSizeGb(sizeInBytes: number) {
  return (sizeInBytes / 1e9).toFixed(2);
}

function openDeleteConfirmationDialog(type: 'movies' | 'series', item: any) {
  if (!item) {
    if (type == 'movies') {
      item = selectedMovie.value;
    }
    if (type == 'series') {
      item = selectedSerie.value;
    }
  }
  itemToDelete.value = {
    type: type,
    item: item
  };
  deleteConfirmationDialog.value = true;
}

function confirmDelete() {
  const val = itemToDelete.value;
  if (val && (val.type === 'movies' || val.type === 'series')) {
    deleteItem((val.type as 'movies' | 'series'), val.item);
    resetDeleteConfirmationDialog();
    resetItemToDelete();
    resetMovieDialog();
    resetSerieDialog();
  }
}

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

watch(search, (newValue) => {
  if (newValue) {
    localStorage.setItem("library_search_" + window.location.href, newValue);
  } else {
    localStorage.removeItem("library_search_" + window.location.href);
  }

  getContent('movies');
  getContent('series');
});

watch(selected_view, (newValue) => {
  if (newValue) {
    localStorage.setItem("library_selected_" + window.location.href, newValue);
  }
});

onMounted(() => {
  if (localStorage.getItem('library_search_' + window.location.href)) {
    search.value = localStorage.getItem('library_search_' + window.location.href) ?? '';
  }

  if (localStorage.getItem('library_selected_' + window.location.href)) {
    const sel = localStorage.getItem('library_selected_' + window.location.href);
    if (sel === 'movies' || sel === 'series') {
      selected_view.value = sel;
    }
  }

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
    <v-row>
      <v-col>
        <v-text-field
          v-model="search"
          label="Search"
          variant="outlined"
          prepend-icon="mdi-magnify"
          clearable
          />
      </v-col>
      <v-col
        v-if="$vuetify.display.smAndUp"
        cols="2"
        >
        <v-text-field
          v-if="selected_view == 'movies'"
          label="Number"
          variant="outlined"
          v-model="total_movies"
          :disabled="true"
          prepend-icon="mdi-information-outline"
          />
        <v-text-field
          v-if="selected_view == 'series'"
          label="Number"
          variant="outlined"
          v-model="total_series"
          :disabled="true"
          prepend-icon="mdi-information-outline"
          />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <v-btn-toggle
          v-model="selected_view"
          color="primary"
          variant="outlined"
          mandatory
          >
          <v-btn
            value="movies"
            prepend-icon="mdi-movie-open-outline"
            >
            Movies
          </v-btn>
          <v-btn
            value="series"
            prepend-icon="mdi-television-classic"
            >
            Series
          </v-btn>
        </v-btn-toggle>
      </v-col>
      <v-col
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
      </v-col>
    </v-row>
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
      <Loading
        :isLoading="isLoadingMovie"
        sentence="Research in progress..."
        />
      <MediaGrid
        :paginated_items="paginated_movies"
        id-field="id"
        announcementName="Release"
        :showHasFile="true"
        @card-click="handleMovieClick"
        />
      <v-alert
        v-if="!filtered_movies.length && !isLoadingMovie"
        type="info"
        class="mt-4"
        >
        No movies found
      </v-alert>
      <v-pagination
        v-if="filtered_movies.length > 0"
        v-model="movie_page"
        :length="movies_total_pages"
        rounded
        />
      <MediaDialog
        v-model="movieDialog"
        mediaType="Movie"
        :item="selectedMovie"
        announcementName="Release"
        :showSearch="!!selectedMovie && !selectedMovie.hasFile && selectedMovie.status == 'released'"
        :showAdd="false"
        :showRemove="!!selectedMovie"
        @search="searchContent('movies', $event)"
        @add=""
        @remove="openDeleteConfirmationDialog('movies', $event)"
      />
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
      <Loading
        :isLoading="isLoadingSerie"
        sentence="Research in progress..."
        />
      <MediaGrid
        :paginated_items="paginated_series"
        id-field="id"
        announcementName="Premiere"
        :showHasFile="false"
        @card-click="handleSerieClick"
        />
      <v-alert
        v-if="!filtered_series.length && !isLoadingSerie"
        type="info"
        class="mt-4"
        >
        No series found
      </v-alert>
      <v-pagination
        v-if="filtered_series.length > 0"
        v-model="serie_page"
        :length="series_total_pages"
        rounded
        />
      <MediaDialog
        v-model="serieDialog"
        mediaType="Serie"
        :item="selectedSerie"
        announcementName="Premiere"
        :showSearch="!!selectedSerie && selectedSerie.statistics && selectedSerie.statistics.sizeOnDisk == 0 && selectedSerie.status != 'upcoming'"
        :showAdd="false"
        :showRemove="!!selectedSerie"
        @search="searchContent('series', $event)"
        @add=""
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
        <template
          #details
          >
          <v-row
            v-if="serieDialog && !isLoadingSerieEpisodes && totalSerieSizeOnDisk > 0"
            >
            <v-col>
              <v-text-field
                label="Size (GB)"
                variant="outlined"
                :model-value="formatSizeGb(totalSerieSizeOnDisk)"
                :disabled="true"
                />
            </v-col>
          </v-row>
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
