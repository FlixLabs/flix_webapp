<script setup lang="ts">

import { ref, computed, onMounted } from 'vue';

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

const initial_serie_items = [];
const serie_items = ref(initial_serie_items);
const reset_serie_items = () => {
  serie_items.value = structuredClone(initial_serie_items);
};

const selected_view = ref<'movie' | 'series'>('movie');

function getContent(type) {
  let base_url = null;
  let api_key = null;

  if (type == 'movie') {
    is_loading_movie.value = true;
    base_url = import.meta.env.VITE_RADARR_BASE_URL;
    api_key = import.meta.env.VITE_RADARR_API_KEY;
  }
  if (type == 'series') {
    is_loading_serie.value = true;
    base_url = import.meta.env.VITE_SONARR_BASE_URL;
    api_key = import.meta.env.VITE_SONARR_API_KEY;
  }

  fetch(base_url + '/api/v3/' + type + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        let id = null;
        let alreadyInLibrary = null;

        if (type == 'movie') {
          id = item.tmdbId;
        }
        if (type == 'series') {
          id = item.tvdbId;
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
          selected_quality: 1
        });
      }

      items.sort((a, b) => a.title.localeCompare(b.title));

      if (type == 'movie') {
        movie_items.value = items;
      }
      if (type == 'series') {
        serie_items.value = items;
      }
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      if (type == 'movie') {
        is_loading_movie.value = false;
      }
      if (type == 'series') {
        is_loading_serie.value = false;
      }
    });
}

const filteredMovies = computed(() => {
  if (!search.value) return movie_items.value;
  return movie_items.value.filter(movie =>
    movie.title.toLowerCase().includes(search.value.toLowerCase())
  );
});

const filteredSeries = computed(() => {
  if (!search.value) return serie_items.value;
  return serie_items.value.filter(serie =>
    serie.title.toLowerCase().includes(search.value.toLowerCase())
  );
});

onMounted(() => {
  getContent('movie');
  getContent('series');
});
</script>

<template>
  <v-container>
    <v-text-field
      v-model="search"
      label="Search"
      variant="outlined"
      prepend-icon="mdi-magnify"
      clearable
      />
    <v-btn-toggle
      v-model="selected_view"
      mandatory
      rounded="xl"
      >
      <v-btn
        value="movie"
        >
        Films
      </v-btn>
      <v-btn
        value="series"
        >
        Séries
      </v-btn>
    </v-btn-toggle>
    <div
      v-if="selected_view == 'movie'"
      >
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
      <v-row
        v-else-if="filteredMovies.length"
        class="mt-2"
        dense
        >
        <v-col
          v-for="(item, index) in filteredMovies"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
          >
          <v-card>
            <v-img
              :src="item.prependAvatar"
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              ({{ item.year }})
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
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
      <v-row
        v-else-if="filteredSeries.length"
        class="mt-2"
        dense
        >
        <v-col
          v-for="(item, index) in filteredSeries"
          :key="index"
          cols="6"
          sm="4"
          md="3"
          lg="2"
          class="mb-4"
          >
          <v-card>
            <v-img
              :src="item.prependAvatar"
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              ({{ item.year }})
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
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
