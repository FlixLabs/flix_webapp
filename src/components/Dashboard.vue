<script setup lang="ts">

import { ref, watch, computed, onMounted } from "vue";

const alert = ref({
  visible: false,
  type: null,
  icon: null,
  text: ''
});

const is_loading_movie = ref(false);
const is_loading_serie = ref(false);

const initial_search = '';
const search = ref(initial_search);
const reset_search = () => {
  search.value = structuredClone(initial_search);
};

const initial_movie_items = [];
const movie_items = ref(initial_movie_items);
const reset_movie_items = () => {
  movie_items.value = structuredClone(initial_movie_items);
};

const initial_quality_movie_items = [];
const quality_movie_items = ref(initial_quality_movie_items);
const reset_quality_movie_items = () => {
  quality_movie_items.value = structuredClone(initial_quality_movie_items);
};

const initial_quality_movie = 1;
const quality_movie = ref(initial_quality_movie);
const reset_quality_movie = () => {
  quality_movie.value = structuredClone(initial_quality_movie);
};

const initial_serie_items = [];
const serie_items = ref(initial_serie_items);
const reset_serie_items = () => {
  serie_items.value = structuredClone(initial_serie_items);
};

const initial_quality_serie_items = [];
const quality_serie_items = ref(initial_quality_serie_items);
const reset_quality_serie_items = () => {
  quality_serie_items.value = structuredClone(initial_quality_serie_items);
};

const initial_quality_serie = 1;
const quality_serie = ref(initial_quality_serie);
const reset_quality_serie = () => {
  quality_serie.value = structuredClone(initial_quality_serie);
};

const items_per_page = 4;
const movie_page = ref(1);
const serie_page = ref(1);

const paginated_movies = computed(() => {
  const start = (movie_page.value - 1) * items_per_page;
  return movie_items.value.slice(start, start + items_per_page);
});

const paginated_series = computed(() => {
  const start = (serie_page.value - 1) * items_per_page;
  return serie_items.value.slice(start, start + items_per_page);
});

function getQualityProfileList(type) {
  let url = null;
  if (type == 'movie') {
    url = import.meta.env.VITE_RADARR_BASE_URL + '/api/v3/qualityProfile?apikey=' + import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'tv') {
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

      if (type == 'movie') {
        quality_movie_items.value = items;
      }
      if (type == 'tv') {
        quality_serie_items.value = items;
      }
    })
    .catch(error => {
      showErrorAlert(error);
    });
}

function getContent(type) {
  let url = null;
  if (type == 'movie') {
    is_loading_movie.value = true;
    url = import.meta.env.VITE_RADARR_BASE_URL + '/api/v3/movie/lookup?term=' + search.value + '&apikey=' + import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'tv') {
    is_loading_serie.value = true;
    url = import.meta.env.VITE_SONARR_BASE_URL + '/api/v3/series/lookup?term=' + search.value + '&apikey=' + import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(url)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        let id = null;
        let alreadyInLibrary = null;

        if (type == 'movie') {
          id = item.tmdbId;
        }
        if (type == 'tv') {
          id = item.tvdbId;
        }

        items.push({
          id: id,
          prependAvatar: item.images?.find(img => img.coverType === "poster")?.remoteUrl || "https://placehold.co/100x150?text=No+Image&font=roboto",
          title: item.title + ' (' + item.year + ')',
          overview: item.overview,
          // passer par une var pour quality
          selected_quality: 1,
          already_in_library: false
        });
      }

      if (type == 'movie') {
        movie_items.value = items;
        movie_page.value = 1;
      }
      if (type == 'tv') {
        serie_items.value = items;
        serie_page.value = 1;
      }

      isAlreadyInLibrary(type);
    })
    .catch(error => {
      showErrorAlert(error);
    })
    .finally(() => {
      if (type == 'movie') {
        is_loading_movie.value = false;
      }
      if (type == 'tv') {
        is_loading_serie.value = false;
      }
    });
}

function isAlreadyInLibrary(type) {
  let url = null;
  if (type == 'movie') {
    url = import.meta.env.VITE_RADARR_BASE_URL + '/api/v3/movie?apikey=' + import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'tv') {
    url = import.meta.env.VITE_SONARR_BASE_URL + '/api/v3/series?apikey=' + import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(url)
    .then(async response => {
      const json_data = await response.json();

      let array_items = [];
      let id_key = null;

      if (type == 'movie') {
        array_items = movie_items.value;
        id_key = 'tmdbId';
      }

      if (type == 'tv') {
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
  let url = null;
  let api_key = null;
  let data = {};

  if (type == 'movie') {
    url = import.meta.env.VITE_RADARR_BASE_URL + '/api/v3/movie';
    api_key = import.meta.env.VITE_RADARR_API_KEY;
    data = {
      tmdbId: item.id,
      title: item.title,
      year: item.year,
      qualityProfileId: item.selected_quality,
      rootFolderPath: "/movies",
      monitored: true
    }
  }
  if (type == 'tv') {
    url = import.meta.env.VITE_SONARR_BASE_URL + '/api/v3/series';
    api_key = import.meta.env.VITE_SONARR_API_KEY;
    data = {
      tvdbId: item.id,
      title: item.title,
      year: item.year,
      qualityProfileId: item.selected_quality,
      rootFolderPath: "/tv",
      monitored: true
    }
  }

  fetch(url, {
		method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json;charset=utf-8',
      'X-Api-Key': api_key
    },
    body: JSON.stringify(data)
	})
  .then(async response => {
    showSuccessAlert();

    getContent('movie');
    getContent('tv');
  })
	.catch(error => {
		showErrorAlert(error);
	});
}

function showSuccessAlert(text = 'L\'opération a été réussie !') {
  alert.value = {
    visible: true,
    type: 'success',
    icon: 'mdi-check-circle',
    text: text
  };
  setTimeout(() => {
    alert.value.visible = false;
  }, 5000);
}

function showErrorAlert(text = 'Une erreur est survenue !') {
  alert.value = {
    visible: true,
    type: 'error',
    icon: 'mdi-alert-circle',
    text: text
  };
  setTimeout(() => {
    alert.value.visible = false;
  }, 5000);
}

watch(search, (newValue) => {
  if (newValue && newValue.length >= 3) {
    localStorage.setItem("search_" + window.location.href, newValue);

    getContent('movie');
    getContent('tv');
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

  getQualityProfileList('movie');
  getQualityProfileList('tv');
})

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
  <v-container>
    <v-form>
      <v-row>
        <v-col>
          <v-text-field
            label="Search"
            variant="outlined"
            v-model="search"
            prepend-icon="mdi-search-web"
            clearable
            />
        </v-col>
      </v-row>
    </v-form>
    <v-row>
      <v-col>
        <h3>Films</h3>
        <v-list
          v-if="paginated_movies.length"
          class="custom-list"
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
                {{ item.title }}
              </v-list-item-title>
              <p
                class="truncate-overview"
                >
                {{ item.overview }}
              </p>
              <v-row
                class="control-options"
                >
                <v-col>
                  <v-select
                    v-model="item.selected_quality"
                    :items="quality_movie_items"
                    label="Qualité"
                    variant="outlined"
                    class="select-box"
                    :disabled="item.already_in_library"
                    />
                </v-col>
                <v-col>
                  <v-btn
                    color="primary"
                    block
                    height="55px"
                    class="full-height"
                    @click="addToList('movie', item)"
                    :disabled="item.already_in_library"
                    >
                    Ajouter
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
            Recherche en cours...
          </span>
        </v-row>
        <v-alert
          v-else-if="search.length > 0 && !movie_items.length"
          type="info"
          >
          Aucun film trouvé
        </v-alert>
        <v-pagination
          v-if="movie_items.length > items_per_page"
          v-model="movie_page"
          :length="Math.ceil(movie_items.length / items_per_page)"
          rounded
          />
      </v-col>
      <v-col>
        <h3>Séries</h3>
        <v-list
          v-if="paginated_series.length"
          class="custom-list"
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
                {{ item.title }}
              </v-list-item-title>
              <p
                class="truncate-overview"
                >
                {{ item.overview }}
              </p>
              <v-row
                class="control-options"
                >
                <v-col>
                  <v-select
                    v-model="item.selected_quality"
                    :items="quality_serie_items"
                    label="Qualité"
                    variant="outlined"
                    class="select-box"
                    :disabled="item.already_in_library"
                    />
                </v-col>
                <v-col>
                  <v-btn
                    color="primary"
                    block
                    height="55px"
                    class="full-height"
                    @click="addToList('tv', item)"
                    :disabled="item.already_in_library"
                    >
                    Ajouter
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
            Recherche en cours...
          </span>
        </v-row>
        <v-alert
          v-else-if="search.length > 0 && !serie_items.length"
          type="info"
          >
          Aucune série trouvée
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

.control-options {
  margin-top: 5px;
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
