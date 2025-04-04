<script setup lang="ts">

import { ref, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useDialog } from '@/composables/useDialog';
import { useLibraryChecker } from '@/composables/useLibraryChecker';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';

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
const { filteredItems: filtered_series } = useFilteredItems(serieItems, search);
const series_total_pages = computed(() =>
  Math.ceil(filtered_series.value.length / items_per_page)
);
const { paginatedItems: paginated_series } = usePagination(filtered_series, serie_page, items_per_page);
const { total: total_series } = useCount(filtered_series);
const { isAlreadyInLibrary: checkSeries } = useLibraryChecker("series", serieItems, showErrorAlert, useAPI);

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
        let alreadyInLibrary = null;
        let release_date = null;
        let title = null;

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
          poster: poster_full,
          title: title,
          release_date: release_date,
          overview: item.overview
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
                let alreadyInLibrary = null;
                let release_date = null;
                let title = null;

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
                  poster: poster_full,
                  title: title,
                  release_date: release_date,
                  overview: item.overview
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
        .then(tvdbId => serie.tvdbId = tvdbId);
    }
    selectedSerie.value = serie;
    serieDialog.value = true;
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

function deleteFromList(type, item) {
  let base_url = null;
  let api_key = null;
  let url_type = null;

  if (type == 'movies') {
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
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.sonarr.base_url;
      api_key = selectedInstanceData.value.sonarr.api_key;
    }
    url_type = 'series';
  }

  fetch(base_url + '/api/v3/' + url_type + '/' + item.id + '?apikey=' + api_key + '&deleteFiles=true', {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=utf-8',
    },
  })
  .then(async response => {
    if (response.ok) {
      showSuccessAlert("Deleted successfully");
      getContent(type, true);
    }
  })
  .catch(error => {
    showErrorAlert("Deletion failed");
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
    deleteFromList(type, item);
    resetDeleteConfirmationDialog();
    resetItemToDelete();
    resetMovieDialog();
    resetSerieDialog();
  }
}

onMounted(() => {
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
      <v-row
        v-if="isLoadingMovie"
        justify="center"
        align="center"
        class="mt-4"
        >
        <v-progress-circular
          indeterminate
          color="primary"
          size="50"
          />
        <span
          class="ml-2"
          >
          Research in progress...
        </span>
      </v-row>
      <v-row
        v-else-if="filtered_movies.length"
        class="mt-2"
        dense
        >
        <v-col
          v-for="(item, index) in paginated_movies"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
          >
          <v-card
            @click="handleMovieClick(item.tmdbId)"
            >
            <v-img
              :src="item.poster"
              class="w-100"
              height="250"
              cover
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              (Realease {{ item.release_date }})
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_movies.length && !isLoadingMovie"
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
      <v-dialog
        v-model="movieDialog"
        max-width="600px"
        max-height="600px"
        >
        <v-card>
          <v-card-title>
            Movie
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col>
                <v-card>
                  <v-img
                    :src="selectedMovie.poster"
                    class="w-100"
                    cover
                    />
                </v-card>
              </v-col>
              <v-col>
                <v-row>
                  <v-col>
                    {{ selectedMovie.title }}
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    (Release {{ selectedMovie.release_date }})
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    {{ selectedMovie.overview }}
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions>
            <v-btn
              v-if="!selectedMovie.already_in_library"
              @click="addToList('movies', selectedMovie)"
              color="primary"
              >
              Add
            </v-btn>
            <v-btn
              v-else
              @click="openDeleteConfirmationDialog('movies', selectedMovie)"
              color="error"
              >
              Remove
            </v-btn>
            <v-btn
              @click="resetMovieDialog()"
              color="secondary"
              >
              Close
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
      <v-row
        v-if="isLoadingSerie"
        justify="center"
        align="center"
        class="mt-4"
        >
        <v-progress-circular
          indeterminate
          color="primary"
          size="50"
          />
        <span
          class="ml-2"
          >
          Research in progress...
        </span>
      </v-row>
      <v-row
        v-else-if="filtered_series.length"
        class="mt-2"
        dense
        >
        <v-col
          v-for="(item, index) in paginated_series"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
          >
          <v-card
            @click="handleSerieClick(item.tmdbId)"
            >
            <v-img
              :src="item.poster"
              class="w-100"
              height="250"
              cover
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              (Premiere {{ item.release_date }})
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_series.length && !isLoadingSerie"
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
      <v-dialog
        v-model="serieDialog"
        max-width="600px"
        max-height="600px"
        >
        <v-card>
          <v-card-title>
            Serie
          </v-card-title>
          <v-card-text>
            <v-row>
              <v-col>
                <v-card>
                  <v-img
                    :src="selectedSerie.poster"
                    class="w-100"
                    cover
                    />
                </v-card>
              </v-col>
              <v-col>
                <v-row>
                  <v-col>
                    {{ selectedSerie.title }}
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    (Premiere {{ selectedSerie.release_date }})
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    {{ selectedSerie.overview }}
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions>
            <v-btn
              v-if="!selectedSerie.already_in_library"
              @click="addToList('series', selectedSerie)"
              color="primary"
              >
              Add
            </v-btn>
            <v-btn
              v-else
              @click="openDeleteConfirmationDialog('series', selectedSerie)"
              color="error"
              >
              Remove
            </v-btn>
            <v-btn
              @click="resetSerieDialog()"
              color="secondary"
              >
              Close
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </v-container>
</template>

<style scoped>
.title-line {
  font-size: 1rem;
  line-height: 1.2;
  font-weight: bold;
}
</style>
