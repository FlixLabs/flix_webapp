<script setup lang="ts">

import { ref, watch, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useDialog } from '@/composables/useDialog';
import { useLibraryChecker } from '@/composables/useLibraryChecker';
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
const { isAlreadyInLibrary: checkMovies } = useLibraryChecker("movies", movieItems, showErrorAlert, useAPI);

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
const { isAlreadyInLibrary: checkSeries } = useLibraryChecker("series", serieItems, showErrorAlert, useAPI);
const { state: isLoadingSerieEpisodes, reset: resetIsLoadingSerieEpisodes } = useResettable(false);

const { deleteItem } = useDeleteItem({
  useAPI,
  selectedInstanceData,
  showSuccessAlert,
  showErrorAlert,
  refreshContent: getContent
});

function getContent(type) {
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  let url_type = null;
  let url_request = null;

  if (type == 'movies') {
    isLoadingMovie.value = true;
    url_type = 'movie';
    url_request = 'upcoming';
  }
  if (type == 'series') {
    isLoadingSerie.value = true;
    url_type = 'tv';
    url_request = 'on_the_air';
  }

  fetch(base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (const item of json_data.results) {
        let tmdbId = null;
        let tvdbId = null;
        let alreadyInLibrary = null;
        let release_date = null;
        let title = null;
        let hasFile = null;
        let status = null;
        let runTime = null;
        let quality = null;
        let relativePath = null;
        let statistics = null;

        let poster_full = 'https://placehold.co/100x150?text=No+Image&font=roboto';
        if (item.poster_path) {
          poster_full = 'https://image.tmdb.org/t/p/w500' + item.poster_path;
        }

        if (type == 'movies') {
          release_date = item.release_date;
          title = item.title;
        }
        if (type == 'series') {
          release_date = item.first_air_date;
          title = item.name;
        }

        items.push({
          tmdbId: item.id,
          tvdbId: tvdbId,
          poster: poster_full,
          title: title,
          release_date: release_date,
          overview: item.overview,
          hasFile: hasFile,
          status: status,
          relativePath: relativePath,
          statistics: statistics
        });
      }

      let total_pages = json_data.total_pages || 1;
      let promises = [];

      for (let page = 2; page <= total_pages; page++) {
        let url = base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key + '&page=' + page;
        promises.push(
          fetch(url)
            .then(async (response) => {
              const page_data = await response.json();

              for (const item of page_data.results) {
                let tmdbId = null;
                let tvdbId = null;
                let alreadyInLibrary = null;
                let release_date = null;
                let title = null;
                let hasFile = null;
                let status = null;
                let relativePath = null;
                let statistics = null;

                let poster_full = "https://placehold.co/100x150?text=No+Image&font=roboto";
                if (item.poster_path) {
                  poster_full = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                }

                if (type == 'movies') {
                  release_date = item.release_date;
                  title = item.title;
                }
                if (type == 'series') {
                  release_date = item.first_air_date;
                  title = item.name;
                }

                items.push({
                  tmdbId: item.id,
                  tvdbId: tvdbId,
                  poster: poster_full,
                  title: title,
                  release_date: release_date,
                  overview: item.overview,
                  hasFile: hasFile,
                  status: status,
                  relativePath: relativePath,
                  statistics: statistics
                });
              }
            })
        );
      }

      return Promise.all(promises).then(() => {
        if (type == 'movies') {
          movieItems.value = items;
          checkMovies();
        }
        if (type == 'series') {
          serieItems.value = items;
          checkSeries();
        }
      });
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
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  let base_url_sonarr = null;
  let api_key_sonarr = null;

  serieDialog.value = true;
  isLoadingSerieEpisodes.value = true;

  serieEpisodes.value = [];

  if (!useAPI.value) {
    base_url_sonarr = import.meta.env.VITE_SONARR_BASE_URL;
    api_key_sonarr = import.meta.env.VITE_SONARR_API_KEY;
  } else {
    base_url_sonarr = selectedInstanceData.value.sonarr.base_url;
    api_key_sonarr = selectedInstanceData.value.sonarr.api_key;
  }

  fetch(base_url + '/tv/' + serie_id + '?api_key=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();
      const seasonPromises = [];

      for (const season of json_data.seasons) {
        const seasonPromise = fetch(base_url + '/tv/' + serie_id + '/season/' + season.season_number + '?api_key=' + api_key)
          .then(response => response.json())
          .then(async seasonData => {
            let tmdbEpisodes: any[] = [];

            if (seasonData && Array.isArray(seasonData.episodes)) {
              tmdbEpisodes = seasonData.episodes
                .filter(episode =>
                  episode &&
                  episode.name &&
                  typeof episode.season_number !== 'undefined' &&
                  episode.episode_number &&
                  episode.air_date
                )
                .map(episode => ({
                  title: episode.name,
                  season: episode.season_number,
                  episode: episode.episode_number,
                  airDate: episode.air_date,
                  hasFile: false,
                  relativePath: null,
                  sizeOnDisk: null
                }));
            }

            if (selectedSerie.value.id) {
              await fetch(base_url_sonarr + '/api/v3/episode?includeEpisodeFile=true&apikey=' + api_key_sonarr + '&seriesId=' + selectedSerie.value.id)
                .then(async (response) => {
                  const json_data_sonarr = await response.json();

                  const lookup = {};
                  json_data_sonarr.forEach(episodeData => {
                    const key = 'S' + String(episodeData.seasonNumber).padStart(2, '0') + 'E' + String(episodeData.episodeNumber).padStart(2, '0');
                    lookup[key] = episodeData;
                  });

                  tmdbEpisodes.forEach(episodeData => {
                    const key = 'S' + String(episodeData.season).padStart(2, '0') + 'E' + String(episodeData.episode).padStart(2, '0');
                    const matched = lookup[key];
                    if (matched) {
                      episodeData.hasFile = matched.hasFile;
                      episodeData.relativePath = matched.episodeFile ? matched.episodeFile.relativePath : null,
                      episodeData.sizeOnDisk = matched.episodeFile ? matched.episodeFile.size : null,
                      episodeData.quality = matched.episodeFile ? matched.episodeFile.quality.quality.name : null
                    }
                  });
                })
                .catch((error) => {
                  //showErrorAlert(error);
                });
            }

            return tmdbEpisodes;
          })
          .catch(error => {
            return [];
          });

        seasonPromises.push(seasonPromise);
      }

      const seasonsEpisodes = await Promise.all(seasonPromises);
      const episodesArray = seasonsEpisodes.flat();

      serieEpisodes.value = episodesArray.filter(
        episode => episode && typeof episode.season !== 'undefined'
      );

      isLoadingSerieEpisodes.value = false;
    })
    .catch((error) => {
      showErrorAlert(error);
    });
}

function handleMovieClick(movie_id: number) {
  const movie = movieItems.value.find(movie => movie.tmdbId === movie_id);
  if (movie) {
    selectedMovie.value = movie;
    movieDialog.value = true;
  }
}

function handleSerieClick(serie_id: number) {
  const serie = serieItems.value.find(serie => serie.tmdbId === serie_id);
  if (serie) {
    if (!serie.tvdbId) {
      getSerieTvdbId(serie)
        .then(tvdbId => {
          serie.tvdbId = tvdbId;
        });
    }
    selectedSerie.value = serie;
    getSerieEpisodes(serie.tmdbId);
  }
}

const getSerieTvdbId = async (serie) => {
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  let tvdbId = null;

  await fetch(base_url + '/tv/' + serie.tmdbId + '/external_ids?api_key=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      tvdbId = json_data.tvdb_id;
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
    });

  return tvdbId;
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

function addToList(type, item) {
  let base_url = null;
  let api_key = null;
  let url_type = null;
  let data = {};

  // gerer de maniere generique
  const qualityProfileId = 1;

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
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      qualityProfileId: qualityProfileId,
      rootFolderPath: "/movies",
      monitored: true,
      addOptions: {
        searchForMovie: true
      }
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
      tvdbId: item.tvdbId,
      title: item.title,
      year: item.year,
      qualityProfileId: qualityProfileId,
      rootFolderPath: "/tv",
      monitored: true,
      addOptions: {
        searchForMissingEpisodes: true
      }
    }
  }

  fetch(base_url + '/api/v3/' + url_type, {
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
      showSuccessAlert("Added successfully");
      getContent(type, true);
    }
  })
	.catch(error => {
		showErrorAlert("Adding failed");
	})
  .finally(() => {
    if (type == 'movies') {
      resetMovieDialog();
    }
    if (type == 'series') {
      resetSerieDialog();
    }
  });
}

function openDeleteConfirmationDialog(type, item) {
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

watch(search, (newValue) => {
  if (newValue) {
    localStorage.setItem("outings_search_" + window.location.href, newValue);
  } else {
    localStorage.removeItem("outings_search_" + window.location.href);
  }

  getContent('movies');
  getContent('series');
});

watch(selected_view, (newValue) => {
  if (newValue) {
    localStorage.setItem("outings_selected_" + window.location.href, newValue);
  }
});

onMounted(() => {
  if (localStorage.getItem('outings_search_' + window.location.href)) {
    search.value = localStorage.getItem('outings_search_' + window.location.href);
  }

  if (localStorage.getItem('outings_selected_' + window.location.href)) {
    selected_view.value = localStorage.getItem('outings_selected_' + window.location.href);
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
    </v-row>
    <div
      v-if="selected_view == 'movies'">
      <Loading
        :isLoading="isLoadingMovie"
        />
      <MediaGrid
        :filtered_items="filtered_movies"
        :paginated_items="paginated_movies"
        id-field="tmdbId"
        announcementName="Release"
        :showHasFile="true"
        @card-click="handleMovieClick"
        />
      <v-alert
        v-if="!filtered_movies.length && !isLoadingMovie"
        type="info"
        class="mt-4"
        >
        No upcoming movies found
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
        :showAdd="selectedMovie && !selectedMovie.already_in_library"
        :showRemove="selectedMovie && selectedMovie.already_in_library"
        @search="searchContent('movies', $event)"
        @add="addToList('movies', $event)"
        @remove="openDeleteConfirmationDialog('movies', $event)"
        />
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
      <Loading
        :isLoading="isLoadingSerie"
        />
      <MediaGrid
        :filtered_items="filtered_series"
        :paginated_items="paginated_series"
        id-field="tmdbId"
        announcementName="Premiere"
        :showHasFile="false"
        @card-click="handleSerieClick"
        />
      <v-alert
        v-if="!filtered_series.length && !isLoadingSerie"
        type="info"
        class="mt-4"
        >
        No upcoming series found
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
        :showAdd="selectedSerie && !selectedSerie.already_in_library"
        :showRemove="selectedSerie && selectedSerie.already_in_library"
        @search="searchContent('series', $event)"
        @add="addToList('series', $event)"
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
                />
            </template>
          </EpisodePanel>
        </template>
      </MediaDialog>
    </div>
  </v-container>
</template>
