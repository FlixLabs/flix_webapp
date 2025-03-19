<script setup lang="ts">

import { ref, computed, onMounted } from 'vue';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';

const { state: is_loading_movie, reset: reset_is_loading_movie } = useResettable(false);
const { state: is_loading_serie, reset: reset_is_loading_serie } = useResettable(false);

const selected_serie_id = ref<number | null>(null);
const serie_episodes = ref<any[]>([]);

const initial_episodes_dialog = false;
const episodes_dialog = ref(initial_episodes_dialog);
const reset_episodes_dialog = () => {
  episodes_dialog.value = structuredClone(initial_episodes_dialog);
};

const { state: search, reset: reset_search } = useResettable('');

const movie_items = ref<any[]>([]);
const serie_items = ref<any[]>([]);

const selected_view = ref<'movie' | 'series'>('movie');

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
          hasFile: item.hasFile,
          status: item.status
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
        reset_is_loading_movie();
      }
      if (type == 'series') {
        reset_is_loading_serie();
      }
    });
}

function getSerieEpisodes(serie_id: number) {
  episodes_dialog.value = true;

  serie_episodes.value = [];

  const base_url = import.meta.env.VITE_SONARR_BASE_URL;
  const api_key = import.meta.env.VITE_SONARR_API_KEY;

  fetch(base_url + '/api/v3/episode?apikey=' + api_key + '&seriesId=' + serie_id)
    .then(async (response) => {
      const json_data = await response.json();

      serie_episodes.value = json_data.map((episode) => ({
        title: episode.title,
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        airDate: episode.airDate,
        hasFile: episode.hasFile
      }));
    })
    .catch((error) => {
      console.error(error);
    });
}

function handleSerieClick(serie_id: number) {
  const selected_serie = serie_items.value.find(serie => serie.internalId === serie_id);
  if (selected_serie) {
    getSerieEpisodes(selected_serie.internalId);
  }
}

const grouped_episodes = computed(() => {
  return serie_episodes.value.reduce((acc, episode) => {
    if (!acc[episode.season]) {
      acc[episode.season] = [];
    }
    acc[episode.season].push(episode);
    return acc;
  }, {} as Record<number, any[]>);
});

onMounted(() => {
  getContent('movie');
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
          v-if="selected_view == 'movie'"
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
            value="movie"
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
              :src="item.prependAvatar"
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
              ({{ item.year }})
            </v-card-text>
            <v-card-action
              class="d-flex justify-center pb-2"
              >
              <v-chip
                v-if="item.hasFile"
                color="green"
                small
                >
                Existing
              </v-chip>
              <v-chip
                v-else
                color="red"
                small
                >
                Missing
              </v-chip>
              <v-chip
                color="blue"
                small
                class="ml-1"
                >
                {{ item.status.charAt(0).toUpperCase() + item.status.slice(1) }}
              </v-chip>
            </v-card-action>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_movies.length && !is_loading_movie"
        type="info"
        class="mt-4"
        >
        No movies found
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
          <v-card
            @click="handleSerieClick(item.internalId)"
            >
            <v-img
              :src="item.prependAvatar"
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
              ({{ item.year }})
            </v-card-text>
            <v-card-action
              class="d-flex justify-center pb-2"
              >
              <v-chip
                color="blue"
                small
                class="ml-1"
                >
                {{ item.status.charAt(0).toUpperCase() + item.status.slice(1) }}
              </v-chip>
            </v-card-action>
          </v-card>
        </v-col>
      </v-row>
      <v-alert
        v-else-if="!filtered_series.length && !is_loading_serie"
        type="info"
        class="mt-4"
        >
        No series found
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
    <v-dialog
      v-model="episodes_dialog"
      max-width="600px"
      max-height="600px"
      >
      <v-card>
        <v-card-title>
          Episodes
        </v-card-title>
        <v-card-text
          v-if="Object.keys(grouped_episodes).length"
          >
          <v-expansion-panels>
            <v-expansion-panel
              v-for="(episodes, season) in grouped_episodes"
              :key="season"
              >
              <v-expansion-panel-title>
                Season {{ season }}
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-list>
                  <v-list-item
                    v-for="(episode, index) in episodes"
                    :key="index"
                    >
                    <v-list-item-content>
                      <v-list-item-title>
                        {{ episode.title }}
                      </v-list-item-title>
                      <v-list-item-subtitle>
                        Episode {{ episode.episode }} - {{ episode.airDate || "Date unknown" }}
                      </v-list-item-subtitle>
                      <v-list-item-action
                        class="pt-2"
                        >
                        <v-chip
                          v-if="episode.hasFile"
                          color="green"
                          small
                          >
                          Existing
                        </v-chip>
                        <v-chip
                          v-else
                          color="red"
                          small
                          >
                          Missing
                        </v-chip>
                      </v-list-item-action>
                    </v-list-item-content>
                  </v-list-item>
                </v-list>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-card-text>
        <v-card-text
          v-else
          >
          <v-alert
            type="info"
            class="mt-4"
            >
            No episode found
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-btn
            @click="reset_episodes_dialog()"
            color="secondary"
            >
            Close
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.title-line {
  font-size: 1rem;
  line-height: 1.2;
  font-weight: bold;
}
</style>
