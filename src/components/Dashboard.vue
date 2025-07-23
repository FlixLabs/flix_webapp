<script setup lang="ts">

import { ref, watch, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useCount } from '@/composables/useCount';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useLibraryChecker } from '@/composables/useLibraryChecker';
import { useDeleteItem } from '@/composables/useDeleteItem';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import Loading from '@/components/common/Loading.vue';

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

const items_per_page = 4;
const movie_page = ref(1);
const serie_page = ref(1);

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieItems, reset: resetMovieItems } = useResettable([]);
const { state: qualityMovieItems, reset: resetQualityMovieItems } = useResettable([]);
const { state: qualityMovie, reset: resetQualityMovie } = useResettable(1);
const { paginatedItems: paginated_movies } = usePagination(movieItems, movie_page, items_per_page);
const { total: total_movies } = useCount(movieItems);
const { isAlreadyInLibrary: checkMovies } = useLibraryChecker("movies", movieItems, showErrorAlert, useAPI);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieItems, reset: resetSerieItems } = useResettable([]);
const { state: qualitySerieItems, reset: resetQualitySerieItems } = useResettable([]);
const { state: qualitySerie, reset: resetQualitySerie } = useResettable(1);
const { paginatedItems: paginated_series } = usePagination(serieItems, serie_page, items_per_page);
const { total: total_series } = useCount(serieItems);
const { isAlreadyInLibrary: checkSeries } = useLibraryChecker("series", serieItems, showErrorAlert, useAPI);

const { deleteItem } = useDeleteItem({
  useAPI,
  selectedInstanceData,
  showSuccessAlert,
  showErrorAlert,
  refreshContent: getContent
});

function getQualityProfileList(type) {
  let base_url = null;
  let api_key = null;

  if (type == 'movies') {
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.radarr.base_url;
      api_key = selectedInstanceData.value.radarr.api_key;
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
  }

  fetch(base_url + '/api/v3/qualityProfile?apikey=' + api_key)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        items.push({
          title: item.name,
          value: item.id
        });
      }

      const any_profile = items.find(i => i.title.toLowerCase() == 'any');

      if (!any_profile) {
        showErrorAlert("The profile 'Any' does not exist. Please create it in Radarr and Sonarr.");
      }

      if (type == 'movies') {
        qualityMovieItems.value = items;
        qualityMovie.value = any_profile.value;
      }
      if (type == 'series') {
        qualitySerieItems.value = items;
        qualitySerie.value = any_profile.value;
      }
    })
    .catch(error => {
      //showErrorAlert(error);
    });
}

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

  fetch(base_url + '/api/v3/' + url_type + '/lookup?term=' + search.value + '&apikey=' + api_key)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        let tmdbId = null;
        let tvdbId = null;
        let alreadyInLibrary = null;
        let quality = null;

        if (type == 'movies') {
          tmdbId = item.tmdbId;
          quality = qualityMovie;
        }
        if (type == 'series') {
          tmdbId = item.tmdbId;
          tvdbId = item.tvdbId;
          quality = qualitySerie;
        }

        let title = item.title;
        const year_str = '(' + item.year + ')';

        if (title.includes(year_str)) {
          title = title.replace(year_str, '').trim();
        }

        items.push({
          id: item.id,
          tmdbId: tmdbId,
          tvdbId: item.tvdbId,
          prependAvatar: item.images?.find(img => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: title,
          year: item.year,
          overview: item.overview,
          selected_quality: quality.value,
          already_in_library: false
        });
      }

      items.sort((a, b) => b.year - a.year);

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

function addToList(type, item) {
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
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      qualityProfileId: item.selected_quality,
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
      qualityProfileId: item.selected_quality,
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
	});
}

function openDeleteConfirmationDialog(type, item) {
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
  }
}

watch(search, (newValue) => {
  if (newValue && newValue.length >= 3) {
    localStorage.setItem("dashboard_search_" + window.location.href, newValue);

    getContent('movies');
    getContent('series');
  } else {
    localStorage.removeItem("dashboard_search_" + window.location.href);

    resetMovieItems();
    resetSerieItems();
  }
});

onMounted(() => {
  if (localStorage.getItem('dashboard_search_' + window.location.href)) {
    search.value = localStorage.getItem('dashboard_search_' + window.location.href);
  }

  getQualityProfileList('movies');
  getQualityProfileList('series');
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
    <v-form>
      <v-row>
        <v-col>
          <v-text-field
            label="Search"
            variant="outlined"
            v-model="search"
            prepend-icon="mdi-magnify"
            clearable
            />
        </v-col>
        <v-col
          v-if="$vuetify.display.smAndUp"
          cols="4"
          >
          <v-row>
            <v-col>
              <v-text-field
                label="Movies"
                variant="outlined"
                v-model="total_movies"
                :disabled="true"
                prepend-icon="mdi-movie-open-outline"
                />
            </v-col>
            <v-col>
              <v-text-field
                label="Series"
                variant="outlined"
                v-model="total_series"
                :disabled="true"
                prepend-icon="mdi-television-classic"
                />
            </v-col>
          </v-row>
        </v-col>
      </v-row>
    </v-form>
    <v-row>
      <v-col
        md="6"
        >
        <h3>Movies</h3>
        <v-list
          v-if="paginated_movies.length"
          class="custom-list mt-4 pa-0"
          >
          <v-list-item
            v-for="(item, index) in paginated_movies"
            :key="index"
            link
            class="pa-0 spacing-list-item"
            >
            <template
              v-slot:prepend
              >
              <v-avatar
                class="custom-avatar"
                >
                <v-img
                  :src="item.prependAvatar"
                  alt="Serie Poster"
                  class="custom-img"
                  />
              </v-avatar>
            </template>
            <v-list-item-content>
              <v-list-item-title>
                {{ item.title }} ({{ item.year }})
              </v-list-item-title>
              <v-tooltip
                :text="item.overview"
                >
                <template #activator="{ props }">
                  <span v-bind="props" style="cursor:pointer;">
                    <p
                      class="truncate-overview"
                      >
                      {{ item.overview }}
                    </p>
                  </span>
                </template>
              </v-tooltip>
              <v-row
                class="mt-4"
                >
                <v-col
                  v-if="$vuetify.display.smAndUp"
                  >
                  <v-select
                    v-model="item.selected_quality"
                    :items="qualityMovieItems"
                    label="Quality"
                    variant="outlined"
                    :disabled="item.already_in_library"
                    />
                </v-col>
                <v-col>
                  <v-btn
                    v-if="!item.already_in_library"
                    color="primary"
                    variant="outlined"
                    @click="addToList('movies', item)"
                    block
                    style="height: 56px"
                    >
                    Add
                  </v-btn>
                  <v-btn
                    v-else
                    color="error"
                    variant="outlined"
                    @click="openDeleteConfirmationDialog('movies', item)"
                    block
                    style="height: 56px"
                    >
                    Remove
                  </v-btn>
                </v-col>
              </v-row>
            </v-list-item-content>
          </v-list-item>
        </v-list>
        <Loading
          :isLoading="isLoadingMovie"
          />
        <v-alert
          v-if="!paginated_movies.length && !isLoadingMovie"
          type="info"
          class="mt-4"
          >
          No movies found
        </v-alert>
        <v-pagination
          v-if="movieItems.length > items_per_page"
          v-model="movie_page"
          :length="Math.ceil(movieItems.length / items_per_page)"
          rounded
          />
      </v-col>
      <v-col
        md="6"
        >
        <h3>Series</h3>
        <v-list
          v-if="paginated_series.length"
          class="custom-list mt-4 pa-0"
          >
          <v-list-item
            v-for="(item, index) in paginated_series"
            :key="index"
            link
            class="pa-0 spacing-list-item"
            >
            <template
              v-slot:prepend
              >
              <v-avatar
                class="custom-avatar"
                >
                <v-img
                  :src="item.prependAvatar"
                  alt="Serie Poster"
                  class="custom-img"
                  />
              </v-avatar>
            </template>
            <v-list-item-content>
              <v-list-item-title>
                {{ item.title }} ({{ item.year }})
              </v-list-item-title>
              <v-tooltip
                :text="item.overview"
                >
                <template #activator="{ props }">
                  <span v-bind="props" style="cursor:pointer;">
                    <p
                      class="truncate-overview"
                      >
                      {{ item.overview }}
                    </p>
                  </span>
                </template>
              </v-tooltip>
              <v-row
                class="mt-4"
                >
                <v-col
                  v-if="$vuetify.display.smAndUp"
                  >
                  <v-select
                    v-model="item.selected_quality"
                    :items="qualitySerieItems"
                    label="Quality"
                    variant="outlined"
                    :disabled="item.already_in_library"
                    />
                </v-col>
                <v-col>
                  <v-btn
                    v-if="!item.already_in_library"
                    color="primary"
                    variant="outlined"
                    @click="addToList('series', item)"
                    block
                    style="height: 56px"
                    >
                    Add
                  </v-btn>
                  <v-btn
                    v-else
                    color="error"
                    variant="outlined"
                    @click="openDeleteConfirmationDialog('series', item)"
                    block
                    style="height: 56px"
                    >
                    Remove
                  </v-btn>
                </v-col>
              </v-row>
            </v-list-item-content>
          </v-list-item>
        </v-list>
        <Loading
          :isLoading="isLoadingSerie"
          />
        <v-alert
          v-if="!paginated_series.length && !isLoadingSerie"
          type="info"
          class="mt-4"
          >
          No series found
        </v-alert>
        <v-pagination
          v-if="serieItems.length > items_per_page"
          v-model="serie_page"
          :length="Math.ceil(serieItems.length / items_per_page)"
          rounded
          />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.custom-list {
  background-color: #121212 !important;
}

.custom-avatar {
  width: 144px !important;
  height: 216px !important;
  border-radius: 5px !important;
  overflow: hidden !important;
}

.custom-img {
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

.truncate-overview {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
  color: gray;
  font-size: 0.9em;
  margin-top: 5px;
  margin-left: 15px;
}

.spacing-list-item:not(:first-child) {
  margin-top: 10px;
}

.spacing-list-item {
  border-radius: 5px !important;
}
</style>
