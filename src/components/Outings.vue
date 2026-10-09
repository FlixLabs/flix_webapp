<script setup lang="ts">
import { readApiJson, requireList, requireObject } from '@/composables/apiResponse';

import { ref, watch, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { usePersistentPreference, isString, isMediaType } from '@/composables/usePersistentPreference';
import { useMediaService } from '@/composables/useMediaService';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useMediaActions, canSearchItem } from '@/composables/useMediaActions';
import { useDialog } from '@/composables/useDialog';
import { useLibraryChecker } from '@/composables/useLibraryChecker';
import { useQualitySelection } from '@/composables/useQualitySelection';
import { useQualityProfiles } from '@/composables/useQualityProfiles';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import MediaDialog from '@/components/common/MediaDialog.vue';
import QualitySelectionDialog from '@/components/common/QualitySelectionDialog.vue';
import EpisodePanel from '@/components/common/EpisodePanel.vue';
import Loading from '@/components/common/Loading.vue';
import MediaBrowserToolbar from '@/components/common/MediaBrowserToolbar.vue';
import MediaBrowserResults from '@/components/common/MediaBrowserResults.vue';
import SeriesSizeField from '@/components/common/SeriesSizeField.vue';
import { useEpisodeSummary } from '@/composables/useEpisodeSummary';
import { fetchTmdbPage } from '@/composables/fetchTmdbPage';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const {
  qualitySelectionDialog,
  resetQualitySelectionDialog,
  itemQuality,
  resetItemQuality
} = useQualitySelection();

const search = usePersistentPreference('outings.search', '', isString);

const selected_view = usePersistentPreference('outings.view', 'movies', isMediaType);

const items_per_page = 12;
const movie_page = ref(1);
const serie_page = ref(1);
const activePage = computed({
  get: () => selected_view.value === 'movies' ? movie_page.value : serie_page.value,
  set: value => { (selected_view.value === 'movies' ? movie_page : serie_page).value = value; },
});

const { state: qualityItems, reset: resetQualityItems } = useResettable<any[]>([]);
const { state: qualitySelected, reset: resetQualitySelected } = useResettable<any | null>(null);

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieItems, reset: resetMovieItems } = useResettable<any[]>([]);
const { state: selectedMovie, reset: resetSelectedMovie } = useResettable<any | null>(null);
const { dialog: movieDialog, reset: resetMovieDialog } = useDialog();
const { filteredItems: filtered_movies } = useFilteredItems(movieItems, search);
const movies_total_pages = computed(() =>
  Math.ceil(filtered_movies.value.length / items_per_page)
);
const { paginatedItems: paginated_movies } = usePagination(filtered_movies, movie_page, items_per_page);
const { total: total_movies } = useCount(filtered_movies);
const { isAlreadyInLibrary: checkMovies } = useLibraryChecker("movies", movieItems, showErrorAlert, useAPI);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieItems, reset: resetSerieItems } = useResettable<any[]>([]);
const { state: selectedSerie, reset: resetSelectedSerie } = useResettable<any | null>(null);
const { dialog: serieDialog, reset: resetSerieDialog } = useDialog();
const { state: serieEpisodes, reset: resetSerieEpisodes } = useResettable<any[]>([]);
const { filteredItems: filtered_series } = useFilteredItems(serieItems, search);
const series_total_pages = computed(() =>
  Math.ceil(filtered_series.value.length / items_per_page)
);
const { paginatedItems: paginated_series } = usePagination(filtered_series, serie_page, items_per_page);
const { total: total_series } = useCount(filtered_series);
const { isAlreadyInLibrary: checkSeries } = useLibraryChecker("series", serieItems, showErrorAlert, useAPI);
const { state: isLoadingSerieEpisodes, reset: resetIsLoadingSerieEpisodes } = useResettable(false);

const { qualityMovieItems, qualitySerieItems, qualityMovie, qualitySerie, getQualityProfileList } = useQualityProfiles({
  useAPI, selectedInstanceData, showErrorAlert
});

const { addItem, deleteItem, searchItem } = useMediaActions({
  useAPI, selectedInstanceData, showSuccessAlert, showErrorAlert, refreshContent: getContent
});

const { deleteConfirmationDialog, resetDeleteConfirmationDialog, openDeleteConfirmationDialog, confirmDelete } = useDeleteConfirmation({
  deleteItem,
  selectedItem: type => type === 'movies' ? selectedMovie.value : selectedSerie.value,
  onConfirm: () => { resetMovieDialog(); resetSerieDialog(); },
});

function getContent(type: 'movies' | 'series') {
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  let url_type = '';
  let url_request = '';

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

  return fetchTmdbPage(base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key)
    .then(async (json_data) => {

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
          fetchTmdbPage(url)
            .then((page_data) => {

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
      showErrorAlert(error instanceof Error ? error.message : 'Unable to load upcoming media. Please try again.');
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
  const { base_url: base_url_sonarr, api_key: api_key_sonarr } = getConfig('series');

  serieDialog.value = true;
  isLoadingSerieEpisodes.value = true;

  serieEpisodes.value = [];

  fetch(base_url + '/tv/' + serie_id + '?api_key=' + api_key)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load seasons (TMDB HTTP ${response.status}).`);
      const json_data: any = requireObject(await readApiJson(response), 'TMDB');
      if (!json_data || !Array.isArray(json_data.seasons)
        || json_data.seasons.some((season: any) => !season || !Number.isInteger(season.season_number))) {
        throw new Error('Invalid season response from TMDB. Please try again.');
      }
      const seasonPromises = [];

      for (const season of json_data.seasons) {
        const seasonPromise = fetch(base_url + '/tv/' + serie_id + '/season/' + season.season_number + '?api_key=' + api_key)
          .then(async response => requireObject(await readApiJson(response), 'TMDB season'))
          .then(async seasonData => {
            let tmdbEpisodes: any[] = [];

            if (seasonData) {
              tmdbEpisodes = requireList(seasonData.episodes, 'season episodes')
                .filter((episode: any) =>
                  episode &&
                  episode.name &&
                  typeof episode.season_number !== 'undefined' &&
                  episode.episode_number &&
                  episode.air_date
                )
                .map((episode: any) => ({
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
                  const json_data_sonarr = requireList(await readApiJson(response), 'episodes');

                  const lookup: Record<string, any> = {};
                  json_data_sonarr.forEach((episodeData: any) => {
                    const key = 'S' + String(episodeData.seasonNumber).padStart(2, '0') + 'E' + String(episodeData.episodeNumber).padStart(2, '0');
                    lookup[key] = episodeData;
                  });

                  tmdbEpisodes.forEach((episodeData: any) => {
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
                  showErrorAlert(error);
                });
            }

            return tmdbEpisodes;
          })
          .catch(error => {
            showErrorAlert(error);
            return [];
          });

        seasonPromises.push(seasonPromise);
      }

      const seasonsEpisodes = await Promise.all(seasonPromises);
      const episodesArray = seasonsEpisodes.flat();

      serieEpisodes.value = episodesArray.filter(
        episode => episode && typeof episode.season !== 'undefined'
      );

    })
    .catch((error) => {
      showErrorAlert(error instanceof Error ? error.message : 'Unable to load seasons.');
    })
    .finally(() => {
      isLoadingSerieEpisodes.value = false;
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

const getSerieTvdbId = async (serie: any) => {
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  let tvdbId = null;

  await fetch(base_url + '/tv/' + serie.tmdbId + '/external_ids?api_key=' + api_key)
    .then(async (response) => {
      const json_data: any = requireObject(await readApiJson(response), 'TMDB');

      tvdbId = json_data.tvdb_id;
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
    });

  return tvdbId;
}

const { grouped_episodes, totalSerieSizeOnDisk } = useEpisodeSummary(serieEpisodes);

function openQualityDialog(type: 'movies' | 'series', item: any) {
  if (type == 'movies') {
    qualityItems.value = qualityMovieItems.value;
    qualitySelected.value = qualityMovie.value;
  }
  if (type == 'series') {
    qualityItems.value = qualitySerieItems.value;
    qualitySelected.value = qualitySerie.value;
  }

  itemQuality.value = { type, item };

  (qualitySelectionDialog as any).value = true;
}

function confirmQuality(selectedValue: any) {
  if (itemQuality.value?.item) {
    itemQuality.value.item.qualityProfileId = selectedValue;
    addItem(itemQuality.value.type, itemQuality.value.item);
  }
  resetItemQuality();
  resetQualityItems();
  resetQualitySelected();
  resetMovieDialog();
  resetSerieDialog();
}


function searchContent(type: 'movies' | 'series', item: any) {
  searchItem(type, item);
  resetMovieDialog();
  resetSerieDialog();
}

watch(search, () => { movie_page.value = 1; serie_page.value = 1; });

onMounted(() => {
  getContent('movies');
  getContent('series');
});

watch(selectedInstance, () => {
  getQualityProfileList('movies');
  getQualityProfileList('series');
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
  <QualitySelectionDialog
    v-model="qualitySelectionDialog"
    :items="qualityItems"
    :selected-value="qualitySelected"
    @update:modelValue="(v) => { if (!v) resetQualitySelected(); }"
    @confirm="confirmQuality"
    @cancel="resetQualitySelectionDialog"
    />
  <v-container>
    <MediaBrowserToolbar
      v-model:page="activePage"
      :total-pages="selected_view === 'movies' ? movies_total_pages : series_total_pages"
      v-model:search="search"
      v-model:selected-view="selected_view"
      :total-movies="total_movies"
      :total-series="total_series"
    >
    </MediaBrowserToolbar>
    <div
      v-if="selected_view == 'movies'"
      >
      <MediaBrowserResults
        :items="paginated_movies"
        :total="total_movies"
        :is-loading="isLoadingMovie"
        id-field="tmdbId"
        announcementName="Release"
        show-announcement
        :showHasFile="true"
        empty-message="No upcoming movies found"
        @card-click="handleMovieClick"
      />
      <MediaDialog
        v-model="movieDialog"
        mediaType="Movie"
        :item="selectedMovie"
        announcementName="Release"
        :showSearch="!!selectedMovie?.already_in_library && canSearchItem('movies', selectedMovie)"
        :showAdd="!!selectedMovie && !selectedMovie.already_in_library && qualityMovieItems.length > 0"
        :showRemove="!!selectedMovie && selectedMovie.already_in_library"
        @search="searchContent('movies', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add="openQualityDialog('movies', $event)"
        @remove="openDeleteConfirmationDialog('movies', $event)"
        />
    </div>
    <div
      v-else-if="selected_view == 'series'"
      >
      <MediaBrowserResults
        :items="paginated_series"
        :total="total_series"
        :is-loading="isLoadingSerie"
        id-field="tmdbId"
        announcementName="Premiere"
        show-announcement
        :showHasFile="false"
        empty-message="No upcoming series found"
        @card-click="handleSerieClick"
      />
      <MediaDialog
        v-model="serieDialog"
        mediaType="Serie"
        :item="selectedSerie"
        announcementName="Premiere"
        :showSearch="!!selectedSerie?.already_in_library && canSearchItem('series', selectedSerie)"
        :showAdd="!!selectedSerie && !selectedSerie.already_in_library && qualitySerieItems.length > 0"
        :showRemove="!!selectedSerie && selectedSerie.already_in_library"
        @search="searchContent('series', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add="openQualityDialog('series', $event)"
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
        <template
          #details
          >
          <SeriesSizeField
            :size="totalSerieSizeOnDisk"
            :is-loading="isLoadingSerieEpisodes"
            :is-open="serieDialog"
          />
        </template>
        <template
          #episodes
          >
          <EpisodePanel
            :grouped_episodes="grouped_episodes"
            :isLoading="isLoadingSerieEpisodes"
            :hasTotalSize="totalSerieSizeOnDisk > 0"
            >
            <template
              #loading
              >
              <Loading
                :isLoading="isLoadingSerieEpisodes"
                sentence="Research in progress..."
                />
            </template>
          </EpisodePanel>
        </template>
      </MediaDialog>
    </div>
  </v-container>
</template>
