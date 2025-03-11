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
  const api_key = import.meta.env.VITE_IMDB_API_KEY;
  const base_url = import.meta.env.VITE_IMDB_BASE_URL;
  let url_type = null;
  let url_request = null;

  if (type == 'movie') {
    is_loading_movie.value = true;
    url_type = 'movie',
    url_request = 'upcoming';
  }
  if (type == 'series') {
    is_loading_serie.value = true;
    url_type = 'tv',
    url_request = 'on_the_air';
  }

  fetch(base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key + '&language=fr-FR')
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (const item of json_data.results) {
        let poster_full = "https://placehold.co/100x150?text=No+Image&font=roboto";
        if (item.poster_path) {
          poster_full = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
        }

        let release_date = null;
        if (type == 'movie') {
          release_date = item.release_date;
        }
        if (type == 'series') {
          release_date = item.first_air_date;
        }

        let title = null;
        if (type == 'movie') {
          title = item.title;
        }
        if (type == 'series') {
          title = item.name;
        }

        items.push({
          id: item.id,
          poster: poster_full,
          title,
          release_date
        });
      }

      items.sort((a, b) => a.release_date.localeCompare(b.release_date));

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
      label="Recherche"
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
      v-if="selected_view == 'movie'">
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
              :src="item.poster"
              aspect-ratio="0.66"
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              {{ item.release_date }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="search.length > 0 && !movie_items.length"
        type="info"
        class="mt-4"
        >
        Aucun film à venir trouvé
      </v-alert>
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
              :src="item.poster"
              aspect-ratio="0.66"
              />
            <v-card-title
              class="title-line text-center"
              >
              {{ item.title }}
            </v-card-title>
            <v-card-text
              class="text-center"
              >
              {{ item.release_date }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="search.length > 0 && !serie_items.length"
        type="info"
        class="mt-4"
        >
        Aucune série trouvée
      </v-alert>
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
