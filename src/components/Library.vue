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
import { useDeleteItem } from '@/composables/useDeleteItem';
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
        let relativePath = null;

        if (type == 'movies') {
          tmdbId = item.tmdbId;
          if (item.movieFile) {
            relativePath = item.movieFile.relativePath;
          }
        }
        if (type == 'series') {
          tvdbId = item.tvdbId;
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
          year: item.year,
          overview: item.overview,
          hasFile: item.hasFile,
          status: item.status,
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
        relativePath: episode.episodeFile ? episode.episodeFile.relativePath : null
      }));
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

onMounted(() => {
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
      v-if="selected_view == 'movies'"
      >
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
            @click="handleMovieClick(item.id)"
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
        v-else-if="!filtered_movies.length && !isLoadingMovie"
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
      <v-dialog
        v-model="movieDialog"
        max-width="600px"
        max-height="600px"
        >
        <v-card
          class="dialog-flex"
          >
          <v-card-title>
            Movie
          </v-card-title>
          <v-card-text
            class="dialog-flex-text"
            >
            <v-row>
              <v-col>
                <v-card>
                  <v-img
                    :src="selectedMovie.prependAvatar"
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
                    ({{ selectedMovie.year }})
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    {{ selectedMovie.overview }}
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
            <v-row
              v-if="selectedMovie.relativePath"
              >
              <v-col>
                <v-text-field
                  label="File"
                  variant="outlined"
                  v-model="selectedMovie.relativePath"
                  :disabled="true"
                  />
              </v-col>
            </v-row>
          </v-card-text>
          <v-card-actions>
            <v-btn
              v-if="selectedMovie && !selectedMovie.hasFile && selectedMovie.status == 'released'"
              @click="searchContent('movies', selectedMovie)"
              color="primary"
              >
              Search
            </v-btn>
            <v-btn
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
            @click="handleSerieClick(item.id)"
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
        v-else-if="!filtered_series.length && !isLoadingSerie"
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
      <v-dialog
        v-model="serieDialog"
        max-width="600px"
        max-height="600px"
        >
        <v-card
          class="dialog-flex"
          >
          <v-card-title>
            Episodes
          </v-card-title>
          <v-card-text
            class="dialog-flex-text"
            >
            <v-row>
              <v-col>
                <v-card>
                  <v-img
                    :src="selectedSerie.prependAvatar"
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
                    ({{ selectedSerie.year }})
                  </v-col>
                </v-row>
                <v-row>
                  <v-col>
                    {{ selectedSerie.overview }}
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
            <div
              v-if="Object.keys(grouped_episodes).length"
              class="mt-4"
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
                          <v-row
                            v-if="episode.relativePath"
                            class="mt-4"
                            >
                            <v-col>
                              <v-text-field
                                label="File"
                                variant="outlined"
                                v-model="episode.relativePath"
                                :disabled="true"
                                />
                            </v-col>
                          </v-row>
                        </v-list-item-content>
                      </v-list-item>
                    </v-list>
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </div>
            <div
              v-else
              >
              <v-alert
                type="info"
                class="mt-4"
                >
                No episode found
              </v-alert>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-btn
              v-if="selectedSerie && selectedSerie.statistics.sizeOnDisk == 0 && selectedSerie.status != 'upcoming'"
              @click="searchContent('series', selectedSerie)"
              color="primary"
              >
              Search
            </v-btn>
            <v-btn
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

.dialog-flex {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.dialog-flex-text {
  flex: 1;
  overflow-y: auto;
}
</style>
