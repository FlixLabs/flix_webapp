<script setup lang="ts">

import { ref, computed, onMounted } from 'vue';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';

const { state: is_loading_movie, reset: reset_is_loading_movie } = useResettable(false);
const { state: is_loading_serie, reset: reset_is_loading_serie } = useResettable(false);

const { state: search, reset: reset_search } = useResettable('');

const movie_items = ref<any[]>([]);
const serie_items = ref<any[]>([]);

const selected_view = ref<'movies' | 'series'>('movies');

const items_per_page = 12;
const movie_page = ref(1);
const serie_page = ref(1);

const { filteredItems: filtered_movies } = useFilteredItems(movie_items, search);
const { filteredItems: filtered_series } = useFilteredItems(serie_items, search);

const movies_total_pages = computed(() =>
  Math.ceil(filtered_movies.value.length / items_per_page)
);

const series_total_pages = computed(() =>
  Math.ceil(filtered_series.value.length / items_per_page)
);

const paginated_movies = computed(() => {
  const start = (movie_page.value - 1) * items_per_page;
  return filtered_movies.value.slice(start, start + items_per_page);
});

const paginated_series = computed(() => {
  const start = (serie_page.value - 1) * items_per_page;
  return filtered_series.value.slice(start, start + items_per_page);
});

const { total: total_movies } = useCount(filtered_movies);
const { total: total_series } = useCount(filtered_series);

function getContent(type) {
  const api_key = import.meta.env.VITE_IMDB_API_KEY;
  const base_url = import.meta.env.VITE_IMDB_BASE_URL;
  let url_type = null;
  let url_request = null;
  let url_suffixe = null;

  if (type == 'movies') {
    is_loading_movie.value = true;
    url_type = 'movie';
    url_request = 'upcoming';
    url_suffixe = '';
  }
  if (type == 'series') {
    is_loading_serie.value = true;
    url_type = 'tv';
    url_request = 'on_the_air';
    url_suffixe = '';
  }

  fetch(base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key + url_suffixe)
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (const item of json_data.results) {
        let poster_full = "https://placehold.co/100x150?text=No+Image&font=roboto";
        if (item.poster_path) {
          poster_full = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
        }

        let release_date = null;
        if (type == 'movies') {
          release_date = item.release_date;
        }
        if (type == 'series') {
          release_date = item.first_air_date;
        }

        let title = null;
        if (type == 'movies') {
          title = item.title;
        }
        if (type == 'series') {
          title = item.name;
        }

        items.push({
          id: item.id,
          poster: poster_full,
          title: title,
          release_date: release_date
        });
      }

      let total_pages = json_data.total_pages || 1;
      let promises = [];
      for (let page = 2; page <= total_pages; page++) {
        let url = base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key + url_suffixe + '&page=' + page;
        promises.push(
          fetch(url)
            .then(async (response) => {
              const page_data = await response.json();
              for (const item of page_data.results) {
                let poster_full = "https://placehold.co/100x150?text=No+Image&font=roboto";
                if (item.poster_path) {
                  poster_full = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                }

                let release_date = null;
                if (type == 'movies') {
                  release_date = item.release_date;
                }
                if (type == 'series') {
                  release_date = item.first_air_date;
                }

                let title = null;
                if (type == 'movies') {
                  title = item.title;
                }
                if (type == 'series') {
                  title = item.name;
                }

                items.push({
                  id: item.id,
                  poster: poster_full,
                  title: title,
                  release_date: release_date
                });
              }
            })
        );
      }

      return Promise.all(promises).then(() => {
        if (type == 'movies') {
          movie_items.value = items;
        }
        if (type == 'series') {
          serie_items.value = items;
        }
      });
    })
    .catch((error) => {
      console.error(error);
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

onMounted(() => {
  getContent('movies');
  getContent('series');
});
</script>

<template>
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
            >
            Movies
          </v-btn>
          <v-btn
            value="series"
            >
            Series
          </v-btn>
        </v-btn-toggle>
      </v-col>
    </v-row>
    <div
      v-if="selected_view == 'movies'">
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
          <v-card>
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
              Realease {{ item.release_date }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_movies.length && !is_loading_movie"
        type="info"
        class="mt-4"
        >
        No upcoming movies found
      </v-alert>
      <v-pagination
        v-if="filtered_movies.length > 0"
        v-model="movie_page"
        :length="movies_total_pages"
        class="mt-4"
        total-visible="7"
        rounded
        />
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
          <v-card>
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
              Premiere {{ item.release_date }}
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_series.length && !is_loading_serie"
        type="info"
        class="mt-4"
        >
        No upcoming series found
      </v-alert>
      <v-pagination
        v-if="filtered_series.length > 0"
        v-model="serie_page"
        :length="series_total_pages"
        class="mt-4"
        total-visible="7"
        rounded
        />
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
