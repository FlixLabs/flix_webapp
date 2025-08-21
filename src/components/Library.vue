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
const { state: movieItems, reset: resetMovieItems } = useResettable([]);
const { state: selectedMovie, reset: resetSelectedMovie } = useResettable(null);
const { dialog: movieDialog, reset: resetMovieDialog } = useDialog();
const { filteredItems: filtered_movies } = useFilteredItems(movieItems, search);
const movies_total_pages = computed(() =>
  Math.ceil(filtered_movies.value.length / items_per_page)
);
const { paginatedItems: paginated_movies } = usePagination(filtered_movies, movie_page, items_per_page);
const { total: total_movies } = useCount(filtered_movies);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieItems, reset: resetSerieItems } = useResettable([]);
const { state: selectedSerie, reset: resetSelectedSerie } = useResettable([]);
const { dialog: serieDialog, reset: resetSerieDialog } = useDialog();
const { state: serieEpisodes, reset: resetSerieEpisodes } = useResettable([]);
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

function getContent(type) {
  let base_url = null;
  let api_key = null;
  let url_type = null;

  if (type == 'movies') {
    isLoadingMovie.value = true;
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.radarr.base_url;
      api_key = selectedInstanceData.value.radarr.api_key;
    }
    url_type = 'movie';
  }
  if (type == 'series') {
    isLoadingSerie.value = true;
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.sonarr.base_url;
      api_key = selectedInstanceData.value.sonarr.api_key;
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
          prependAvatar: item.images?.find(img => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: title,
          certification: item.certification,
          year: item.year,
          runTime: runTime,
          overview: item.overview,
          hasFile: item.hasFile,
          status: item.status,
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
  let base_url = null;
  let api_key = null;

  serieDialog.value = true;
  isLoadingSerieEpisodes.value = true;

  serieEpisodes.value = [];

  if (!useAPI.value) {
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  } else {
    base_url = selectedInstanceData.value.sonarr.base_url;
    api_key = selectedInstanceData.value.sonarr.api_key;
  }

  fetch(base_url + '/api/v3/episode?includeEpisodeFile=true&apikey=' + api_key + '&seriesId=' + serie_id)
    .then(async (response) => {
      const json_data = await response.json();

      serieEpisodes.value = json_data.map((episode) => ({
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

function openDeleteConfirmationDialog(type, item) {
  if (!item) {
    if (type == 'movies') {
      item = selectedMovie.value
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
  if (itemToDelete.value) {
    const { type, item } = itemToDelete.value;
    deleteItem(type, item);
    resetDeleteConfirmationDialog();
    resetItemToDelete();
    resetMovieDialog();
    resetSerieDialog();
  }
}

function searchContent(type, item) {
  let base_url = null;
  let api_key = null;
  let url_type = null;
  let data = {};

  if (type == 'movies') {
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.radarr.base_url;
      api_key = selectedInstanceData.value.radarr.api_key;
    }
    url_type = 'movie';
    data = {
      name: "MoviesSearch",
      movieIds: [item.id]
    }
  }
  if (type == 'series') {
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.sonarr.base_url;
      api_key = selectedInstanceData.value.sonarr.api_key;
    }
    url_type = 'series';
    data = {
      name: "SeriesSearch",
      seriesId: item.id
    }
  }

  fetch(base_url + '/api/v3/command', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=utf-8',
      'X-Api-Key': api_key
    },
    body: JSON.stringify(data)
  })
  .then(async response => {
    if (response.ok) {
      showSuccessAlert("Start search successfully");
      if (type == 'movies') {
        resetMovieDialog();
      }
      if (type == 'series') {
        resetSerieDialog();
      }
    }
  })
  .catch(error => {
    showErrorAlert("Search failed");
  });
}

function timestamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + '_' + p(d.getHours())+ '-' + p(d.getMinutes());
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportLibrary() {
  let exportData;
  if (selected_view.value == 'movies') {
    exportData = filtered_movies.value;
  }
  if (selected_view.value == 'series') {
    exportData = filtered_series.value;
  }

  const rawData = toRaw(exportData);
  const json = JSON.stringify(rawData, null, 2);
  const file = 'flix_' + selected_view.value + '_' + timestamp() + '.json';
  downloadBlob(json, file, 'application/json;charset=utf-8;');
  showSuccessAlert('JSON export started : ' + selected_view.value);
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
    search.value = localStorage.getItem('library_search_' + window.location.href);
  }

  if (localStorage.getItem('library_selected_' + window.location.href)) {
    selected_view.value = localStorage.getItem('library_selected_' + window.location.href);
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
          mandatory
          rounded="xl"
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
        <v-btn
          color="primary"
          prepend-icon="mdi-file-export-outline"
          variant="outlined"
          @click="exportLibrary()"
          >
          Export
        </v-btn>
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
        :showSearch="selectedMovie && !selectedMovie.hasFile && selectedMovie.status == 'released'"
        :showAdd="false"
        :showRemove="selectedMovie"
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
        :showSearch="selectedSerie && selectedSerie.statistics && selectedSerie.statistics.sizeOnDisk == 0 && selectedSerie.status != 'upcoming'"
        :showAdd="false"
        :showRemove="selectedSerie"
        @search="searchContent('series', $event)"
        @add=""
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
        <template
          #episodes
          >
          <EpisodePanel
            :grouped_episodes="grouped_episodes"
            :isLoading="isLoadingSerieEpisodes"
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
