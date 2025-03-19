<script setup lang="ts">

import { ref, watch, computed, onMounted } from 'vue';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from "@/composables/usePagination";

const { alert, resetAlert } = useAlert();

const { state: is_loading_movie, reset: reset_is_loading_movie } = useResettable(false);
const { state: is_loading_serie, reset: reset_is_loading_serie } = useResettable(false);

const initial_delete_confirmation_dialog = false;
const delete_confirmation_dialog = ref(initial_delete_confirmation_dialog);
const reset_delete_confirmation_dialog = () => {
  delete_confirmation_dialog.value = structuredClone(initial_delete_confirmation_dialog);
};

const initial_item_to_delete = {
  type: null,
  item: null
};
const item_to_delete = ref(initial_item_to_delete);
const reset_item_to_delete = () => {
  item_to_delete.value = structuredClone(initial_item_to_delete);
};

const { state: search, reset: reset_search } = useResettable('');

const movie_items = ref<any[]>([]);
const quality_movie_items = ref<any[]>([]);

const initial_quality_movie = 1;
const quality_movie = ref(initial_quality_movie);
const reset_quality_movie = () => {
  quality_movie.value = structuredClone(initial_quality_movie);
};

const serie_items = ref<any[]>([]);
const quality_serie_items = ref<any[]>([]);

const initial_quality_serie = 1;
const quality_serie = ref(initial_quality_serie);
const reset_quality_serie = () => {
  quality_serie.value = structuredClone(initial_quality_serie);
};

const items_per_page = 4;
const movie_page = ref(1);
const serie_page = ref(1);

const { paginatedItems: paginated_movies } = usePagination(movie_items, movie_page, items_per_page);
const { paginatedItems: paginated_series } = usePagination(serie_items, serie_page, items_per_page);

function getQualityProfileList(type) {
  let url = null;
  if (type == 'movies') {
    url = import.meta.env.VITE_RADARR_BASE_URL + '/api/v3/qualityProfile?apikey=' + import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'series') {
    url = import.meta.env.VITE_SONARR_BASE_URL + '/api/v3/qualityProfile?apikey=' + import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(url)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        items.push({
          title: item.name,
          value: item.id,
        });
      }

      const any_profile = items.find(i => i.title.toLowerCase() == 'any');

      if (!any_profile) {
        showErrorAlert("The profile 'Any' does not exist. Please create it in Radarr and Sonarr.");
      }

      if (type == 'movies') {
        quality_movie_items.value = items;
        quality_movie.value = any_profile.value;
      }
      if (type == 'series') {
        quality_serie_items.value = items;
        quality_serie.value = any_profile.value;
      }
    })
    .catch(error => {
      //showErrorAlert(error);
    });
}

function getContent(type, keep_page = false) {
  let base_url = null;
  let api_key = null;
  let url_type = null;

  if (type == 'movies') {
    is_loading_movie.value = true;
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
    url_type = 'movie';
  }
  if (type == 'series') {
    is_loading_serie.value = true;
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
    url_type = 'series';
  }

  fetch(base_url + '/api/v3/' + url_type + '/lookup?term=' + search.value + '&apikey=' + api_key)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        let id = null;
        let alreadyInLibrary = null;
        let quality = null;

        if (type == 'movies') {
          id = item.tmdbId;
          quality = quality_movie;
        }
        if (type == 'series') {
          id = item.tvdbId;
          quality = quality_serie;
        }

        let title = item.title;
        const year_str = '(' + item.year + ')';

        if (title.includes(year_str)) {
          title = title.replace(year_str, '').trim();
        }

        items.push({
          id: id,
          internalId: item.id,
          prependAvatar: item.images?.find(img => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: title,
          year: item.year,
          overview: item.overview,
          // passer par une var pour quality
          selected_quality: quality,
          already_in_library: false
        });
      }

      items.sort((a, b) => b.year - a.year);

      if (type == 'movies') {
        movie_items.value = items;
        if (!keep_page) {
          movie_page.value = 1;
        }
      }
      if (type == 'series') {
        serie_items.value = items;
        if (!keep_page) {
          serie_page.value = 1;
        }
      }

      isAlreadyInLibrary(type);
    })
    .catch(error => {
      showErrorAlert(error);
    })
    .finally(() => {
      if (type == 'movies') {
        reset_is_loading_movie();
      }
      if (type == 'series') {
        reset_is_loading_serie();
      }
    });
}

function isAlreadyInLibrary(type) {
  let base_url = null;
  let api_key = null;
  let url_type = null;

  if (type == 'movies') {
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
    url_type = 'movie';
  }
  if (type == 'series') {
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
    url_type = 'series';
  }

  fetch(base_url + '/api/v3/' + url_type + '?apikey=' + api_key)
    .then(async response => {
      const json_data = await response.json();

      let array_items = [];
      let id_key = null;

      if (type == 'movies') {
        array_items = movie_items.value;
        id_key = 'tmdbId';
      }

      if (type == 'series') {
        array_items = serie_items.value;
        id_key = 'tvdbId';
      }

      if (array_items.length > 0 && id_key) {
        markAsAlreadyInLibrary(array_items, json_data, id_key);
      }
    })
    .catch(error => {
      showErrorAlert(error);
    });
}

function markAsAlreadyInLibrary(array_items, json_data, id_key) {
  for (let item of array_items) {
    for (let compare_item of json_data) {
      if (item.id == compare_item[id_key]) {
        item.already_in_library = true;
      }
    }
  }
}

function addToList(type, item) {
  let base_url = null;
  let api_key = null;
  let url_type = null;
  let data = {};

  if (type == 'movies') {
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
    url_type = 'movie';
    data = {
      tmdbId: item.id,
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
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
    url_type = 'series';
    data = {
      tvdbId: item.id,
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

function deleteFromList(type, item) {
  let base_url = null;
  let api_key = null;
  let url_type = null;

  if (type == 'movies') {
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
    url_type = 'movie';
  }
  if (type == 'series') {
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
    url_type = 'series';
  }

  fetch(base_url + '/api/v3/' + url_type + '/' + item.internalId + '?apikey=' + api_key + '&deleteFiles=true', {
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

function showSuccessAlert(text = 'The operation was successful !') {
  alert.value = {
    visible: true,
    type: 'success',
    icon: 'mdi-check-circle',
    text: text
  };
  setTimeout(() => {
    resetAlert();
  }, 5000);
}

function showErrorAlert(text = 'An error has occurred !') {
  alert.value = {
    visible: true,
    type: 'error',
    icon: 'mdi-alert-circle',
    text: text
  };
  setTimeout(() => {
    resetAlert();
  }, 5000);
}

function openDeleteConfirmationDialog(type, item) {
  item_to_delete.value = {
    type: type,
    item: item
  };
  delete_confirmation_dialog.value = true;
}

function confirmDelete() {
  if (item_to_delete.value) {
    const { type, item } = item_to_delete.value;
    deleteFromList(type, item);
    reset_delete_confirmation_dialog();
    reset_item_to_delete();
  }
}

watch(search, (newValue) => {
  if (newValue && newValue.length >= 3) {
    localStorage.setItem("search_" + window.location.href, newValue);

    getContent('movies');
    getContent('series');
  } else {
    localStorage.removeItem("search_" + window.location.href);

    reset_movie_items();
    reset_serie_items();
  }
});

onMounted(() => {
  if (localStorage.getItem('search_' + window.location.href)) {
    search.value = localStorage.getItem('search_' + window.location.href);
  }

  getQualityProfileList('movies');
  getQualityProfileList('series');
});
</script>

<template>
  <transition
    name="fade"
    @before-enter="beforeEnter"
    @enter="enter"
    @leave="leave"
    >
    <v-alert
      v-if="alert.visible"
      :type="alert.type"
      :icon="alert.icon"
      class="fixed-alert"
      :text="alert.text"
      @click="show_alert = false"
      />
  </transition>
  <v-dialog
    v-model="delete_confirmation_dialog"
    max-width="600px"
    >
    <v-card>
      <v-card-title>
        Confirm deletion
      </v-card-title>
      <v-card-text>
        Are you sure you want to delete this item ? This action cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-btn
          @click="reset_delete_confirmation_dialog()"
          color="secondary"
          >
          Cancel
        </v-btn>
        <v-btn
          @click="confirmDelete"
          color="primary"
          >
          Confirm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
      </v-row>
    </v-form>
    <v-row>
      <v-col
        cols="6"
        >
        <h3>Movies</h3>
        <v-list
          v-if="paginated_movies.length"
          class="custom-list mt-4"
          >
          <v-list-item
            v-for="(item, index) in paginated_movies" :key="index"
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
              <p
                class="truncate-overview"
                >
                {{ item.overview }}
              </p>
              <v-row
                class="mt-4"
                >
                <v-col>
                  <v-select
                    v-model="item.selected_quality"
                    :items="quality_movie_items"
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
        <v-row
          v-if="is_loading_movie"
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
        <v-alert
          v-else-if="!paginated_movies.length && !is_loading_movie"
          type="info"
          >
          No movies found
        </v-alert>
        <v-pagination
          v-if="movie_items.length > items_per_page"
          v-model="movie_page"
          :length="Math.ceil(movie_items.length / items_per_page)"
          rounded
          />
      </v-col>
      <v-col
        cols="6"
        >
        <h3>Series</h3>
        <v-list
          v-if="paginated_series.length"
          class="custom-list mt-4"
          >
          <v-list-item
            v-for="(item, index) in paginated_series" :key="index"
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
              <p
                class="truncate-overview"
                >
                {{ item.overview }}
              </p>
              <v-row
                class="mt-4"
                >
                <v-col>
                  <v-select
                    v-model="item.selected_quality"
                    :items="quality_serie_items"
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
        <v-row
          v-if="is_loading_serie"
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
        <v-alert
          v-else-if="!paginated_series.length && !is_loading_serie"
          type="info"
          >
          No series found
        </v-alert>
        <v-pagination
          v-if="serie_items.length > items_per_page"
          v-model="serie_page"
          :length="Math.ceil(serie_items.length / items_per_page)"
          rounded
          />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.custom-list {
  border-radius: 5px !important;
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

.fixed-alert {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 9999;
  max-width: 300px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
