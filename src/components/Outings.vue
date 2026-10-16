<script setup lang="ts">
import { t, metadataContext } from '@/i18n';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from '@/components/common/ReadFeedback.vue';
import { mediaFileFields } from '@/composables/mediaFileDetails';
import { readApiJson, requireList, requireObject } from '@/composables/apiResponse';

import { ref, watch, computed } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { usePersistentPreference, isString, isMediaType } from '@/composables/usePersistentPreference';
import { useMediaService } from '@/composables/useMediaService';
import { useCount } from '@/composables/useCount';
import { useFilteredItems } from '@/composables/useFilteredItems';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { usePagination } from '@/composables/usePagination';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useMediaActions, canSearchItem, seriesSearchBlockReason } from '@/composables/useMediaActions';
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
import { fetchTmdbPage, localizedTmdbUrl } from '@/composables/fetchTmdbPage';

const store = useFlixStore();

const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig, serviceContext } = useMediaService({ useAPI, selectedInstanceData });

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
const { isAlreadyInLibrary: checkMovies, readState: movieLibraryRead } = useLibraryChecker("movies", movieItems, () => undefined, useAPI);

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
const { isAlreadyInLibrary: checkSeries, readState: seriesLibraryRead } = useLibraryChecker("series", serieItems, () => undefined, useAPI);
const { state: isLoadingSerieEpisodes, reset: resetIsLoadingSerieEpisodes } = useResettable(false);
const episodeRead = useReadRequest(() => [serieDialog.value, selectedSerie.value?.tmdbId, serviceContext()]);
const identityRead = useReadRequest(() => [serieDialog.value, selectedSerie.value?.tmdbId, serviceContext()]);
watch(() => episodeRead.state.loading, value => { isLoadingSerieEpisodes.value = value; }, { flush: 'sync' });

const { qualityMovieItems, qualitySerieItems, qualityMovie, qualitySerie, getQualityProfileList, qualityReads } = useQualityProfiles({
  useAPI, selectedInstanceData, showErrorAlert
});

const reads = {
  movies: useReadRequest(() => [useAPI.value, selectedInstanceData.value, getConfig('movies').base_url, getConfig('movies').api_key]),
  series: useReadRequest(() => [useAPI.value, selectedInstanceData.value, getConfig('series').base_url, getConfig('series').api_key]),
};
for (const type of ['movies', 'series'] as const) {
  watch(() => reads[type].state.loading, value => { (type === 'movies' ? isLoadingMovie : isLoadingSerie).value = value; }, { flush: 'sync' });
  watch(() => reads[type].state.error, error => {
    if (error && !reads[type].state.hasData) (type === 'movies' ? movieItems : serieItems).value = [];
  }, { flush: 'sync' });
}
function readOnly(type: 'movies' | 'series') {
  return [reads[type].state, type === 'movies' ? movieLibraryRead : seriesLibraryRead, qualityReads[type].state]
    .some(state => state.loading || !!state.error || !state.hasData);
}

const { addItem, deleteItem, searchItem } = useMediaActions({
  useAPI, selectedInstanceData, showSuccessAlert, showErrorAlert, refreshContent: getContent
});

const { deleteConfirmationDialog, resetDeleteConfirmationDialog, openDeleteConfirmationDialog, confirmDelete } = useDeleteConfirmation({
  deleteItem,
  selectedItem: type => type === 'movies' ? selectedMovie.value : selectedSerie.value,
  onConfirm: () => { resetMovieDialog(); resetSerieDialog(); },
});

function getContent(type: 'movies' | 'series') {
  const read = reads[type].begin();
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

  return fetchTmdbPage(base_url + '/' + url_type + '/' + url_request + '?api_key=' + api_key, { signal: read.signal })
    .then(async (json_data) => {
      if (!read.isCurrent()) return;

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
          fetchTmdbPage(url, { signal: read.signal })
            .then((page_data) => {
              if (!read.isCurrent()) return;

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
        if (!read.isCurrent()) return;
        if (type == 'movies') {
          movieItems.value = items;
          checkMovies();
        }
        if (type == 'series') {
          serieItems.value = items;
          checkSeries();
        }
        read.success();
      });
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

function getSerieEpisodes(serie_id: number) {
  if (!selectedSerie.value || selectedSerie.value.tmdbId !== serie_id) return;
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  const { base_url: base_url_sonarr, api_key: api_key_sonarr } = getConfig('series');

  serieDialog.value = true;
  const read = episodeRead.begin();
  const mediaId = selectedSerie.value?.id;
  isLoadingSerieEpisodes.value = true;

  if (!episodeRead.state.hasData) serieEpisodes.value = [];

  return fetch(localizedTmdbUrl(base_url + '/tv/' + serie_id + '?api_key=' + api_key), { signal: read.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load seasons (TMDB HTTP ${response.status}).`);
      const json_data: any = requireObject(await readApiJson(response), 'TMDB');
      if (!read.isCurrent()) return;
      if (!json_data || !Array.isArray(json_data.seasons)
        || json_data.seasons.some((season: any) => !season || !Number.isInteger(season.season_number))) {
        throw new Error('Invalid season response from TMDB. Please try again.');
      }
      const seasonPromises = [];
      const sonarrRecords = mediaId ? requireList(await readApiJson(await fetch(
        base_url_sonarr + '/api/v3/episode?includeEpisodeFile=true&apikey=' + api_key_sonarr + '&seriesId=' + mediaId,
        { signal: read.signal, cache: 'no-store' },
      )), 'episodes') : [];
      if (!read.isCurrent()) return;
      const lookup: Record<string, any> = {};
      for (const episode of sonarrRecords) lookup[`${episode.seasonNumber}:${episode.episodeNumber}`] = episode;

      for (const season of json_data.seasons) {
        const seasonPromise = fetch(localizedTmdbUrl(base_url + '/tv/' + serie_id + '/season/' + season.season_number + '?api_key=' + api_key), { signal: read.signal })
          .then(async response => requireObject(await readApiJson(response), 'TMDB season'))
          .then(async seasonData => {
            if (!read.isCurrent()) return [];
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

            for (const episode of tmdbEpisodes) {
              const matched = lookup[`${episode.season}:${episode.episode}`];
              if (matched) {
                episode.hasFile = matched.hasFile;
                Object.assign(episode, mediaFileFields(matched.episodeFile));
              }
            }

            return tmdbEpisodes;
          });

        seasonPromises.push(seasonPromise);
      }

      const seasonsEpisodes = await Promise.all(seasonPromises);
      if (!read.isCurrent()) return;
      const episodesArray = seasonsEpisodes.flat();

      serieEpisodes.value = episodesArray.filter(
        episode => episode && typeof episode.season !== 'undefined'
      );
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

async function refreshSerieFiles() {
  if (!serieDialog.value || !selectedSerie.value?.id || !episodeRead.state.hasData || episodeRead.state.loading) return;
  const selected = selectedSerie.value;
  const { base_url, api_key } = getConfig('series');
  const read = episodeRead.begin();
  try {
    const response = await fetch(`${base_url}/api/v3/episode?includeEpisodeFile=true&seriesId=${selected.id}`, {
      headers: { 'X-Api-Key': api_key }, signal: read.signal, cache: 'no-store',
    });
    const records = requireList<{ seasonNumber: number; episodeNumber: number; hasFile: boolean; episodeFile?: unknown }>(await readApiJson(response), 'episodes');
    if (records.some(item => !Number.isInteger(item.seasonNumber) || !Number.isInteger(item.episodeNumber) || typeof item.hasFile !== 'boolean')) throw new Error('Invalid episode response.');
    if (!read.isCurrent() || !serieDialog.value || selectedSerie.value !== selected) return;
    const byEpisode = new Map(records.map(item => [`${item.seasonNumber}:${item.episodeNumber}`, item]));
    for (const episode of serieEpisodes.value) {
      const record = byEpisode.get(`${episode.season}:${episode.episode}`);
      Object.assign(episode, { hasFile: record?.hasFile === true }, mediaFileFields(record?.episodeFile));
    }
    read.success();
  } catch (error) { read.fail(error); }
  finally { read.finish(); }
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
    selectedSerie.value = serie;
    getSerieEpisodes(serie.tmdbId);
    if (!serie.tvdbId) void getSerieTvdbId(serie);
  }
}

const getSerieTvdbId = async (serie: any) => {
  if (!serie || serie !== selectedSerie.value) return;
  const read = identityRead.begin();
  const base_url = import.meta.env.VITE_TMDB_BASE_URL;
  const api_key = import.meta.env.VITE_TMDB_API_KEY;
  try {
    const data = requireObject(await readApiJson(await fetch(base_url + '/tv/' + serie.tmdbId + '/external_ids?api_key=' + api_key, { signal: read.signal })), 'TMDB');
    if (!read.isCurrent() || serie !== selectedSerie.value) return;
    if (!Number.isSafeInteger(data.tvdb_id) || Number(data.tvdb_id) <= 0) throw new Error('No valid TVDB identity was provided for this series.');
    serie.tvdbId = data.tvdb_id;
    read.success();
  } catch (error) { read.fail(error); }
  finally { read.finish(); }
}

const { grouped_episodes, totalSerieSizeOnDisk } = useEpisodeSummary(serieEpisodes);

function openQualityDialog(type: 'movies' | 'series', item: any) {
  if (readOnly(type)) return;
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
  if (itemQuality.value?.item && !readOnly(itemQuality.value.type)
    && (itemQuality.value.type !== 'series' || Number.isSafeInteger(itemQuality.value.item.tvdbId) && itemQuality.value.item.tvdbId > 0)
    && (itemQuality.value.type === 'movies' ? qualityMovieItems.value : qualitySerieItems.value).some(quality => quality.value === selectedValue)) {
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

watch([serviceContext, metadataContext], () => {
  resetMovieDialog(); resetSerieDialog(); resetSelectedMovie(); resetSelectedSerie();
  resetDeleteConfirmationDialog(); resetQualitySelectionDialog(); resetItemQuality();
  if (useAPI.value && !selectedInstanceData.value) return;
  getQualityProfileList('movies');
  getQualityProfileList('series');
  getContent('movies');
  getContent('series');
}, { immediate: true, flush: 'sync' });
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
      :total-movies="reads.movies.state.hasData ? total_movies : undefined"
      :total-series="reads.series.state.hasData ? total_series : undefined"
    >
    </MediaBrowserToolbar>
    <ReadFeedback :state="reads[selected_view].state" :label="t('Upcoming media')" @retry="getContent(selected_view)" />
    <ReadFeedback :state="selected_view === 'movies' ? movieLibraryRead : seriesLibraryRead" :label="t('Library status')" @retry="selected_view === 'movies' ? checkMovies() : checkSeries()" />
    <ReadFeedback :state="qualityReads[selected_view].state" :label="t('Quality profiles')" @retry="getQualityProfileList(selected_view)" />
    <div
      v-if="selected_view == 'movies'"
      >
      <MediaBrowserResults
        :items="paginated_movies"
        :total="total_movies"
        :is-loading="isLoadingMovie"
        :actions-disabled="reads.movies.state.loading || !!reads.movies.state.error || !reads.movies.state.hasData"
        :unavailable="!!reads.movies.state.error"
        id-field="tmdbId"
        announcementName="Release"
        show-announcement
        :showHasFile="true"
        empty-message="No upcoming movies found"
        @card-click="handleMovieClick"
      />
      <MediaDialog
        v-model="movieDialog"
        :read-only="readOnly('movies')"
        mediaType="Movie"
        :item="selectedMovie"
        :navigation-items="paginated_movies"
        :navigation-pending="isLoadingMovie"
        @navigate="handleMovieClick($event.tmdbId)"
        announcementName="Release"
        :showSearch="!!selectedMovie?.already_in_library && canSearchItem('movies', selectedMovie)"
        :showAdd="!!selectedMovie && !selectedMovie.already_in_library && qualityMovieItems.length > 0"
        :showRemove="!!selectedMovie?.already_in_library"
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
        :actions-disabled="reads.series.state.loading || !!reads.series.state.error || !reads.series.state.hasData"
        :unavailable="!!reads.series.state.error"
        id-field="tmdbId"
        announcementName="Premiere"
        show-announcement
        :showHasFile="false"
        empty-message="No upcoming series found"
        @card-click="handleSerieClick"
      />
      <MediaDialog
        v-model="serieDialog"
        :read-only="readOnly('series') || !!episodeRead.state.error"
        mediaType="Serie"
        :item="selectedSerie"
        :navigation-items="paginated_series"
        :navigation-pending="isLoadingSerie || isLoadingSerieEpisodes"
        @navigate="handleSerieClick($event.tmdbId)"
        announcementName="Premiere"
        :showSearch="!!selectedSerie?.already_in_library && canSearchItem('series', selectedSerie)"
        :search-disabled-reason="seriesSearchBlockReason(episodeRead.state.loading, episodeRead.state.hasData, serieEpisodes.length)"
        @refreshed="refreshSerieFiles"
        :showAdd="!!selectedSerie && !selectedSerie.already_in_library && qualitySerieItems.length > 0"
        :add-disabled="!Number.isSafeInteger(selectedSerie?.tvdbId) || (selectedSerie?.tvdbId ?? 0) <= 0 || identityRead.state.loading || !!identityRead.state.error"
        :showRemove="!!selectedSerie?.already_in_library"
        @search="searchContent('series', $event)"
        @release-grabbed="showSuccessAlert('Release queued successfully')"
        @add="openQualityDialog('series', $event)"
        @remove="openDeleteConfirmationDialog('series', $event)"
        >
        <template #status>
          <ReadFeedback :state="identityRead.state" :label="t('Series identity')" @retry="getSerieTvdbId(selectedSerie)" />
          <ReadFeedback :state="episodeRead.state" :label="t('Series episodes')" @retry="getSerieEpisodes(selectedSerie?.tmdbId)" />
        </template>
        <template
          #details
          >
          <SeriesSizeField
            :size="totalSerieSizeOnDisk"
            :is-loading="isLoadingSerieEpisodes && !episodeRead.state.hasData"
            :is-open="serieDialog"
          />
        </template>
        <template
          #episodes
          >
          <EpisodePanel
            :grouped_episodes="grouped_episodes"
            :isLoading="isLoadingSerieEpisodes && !episodeRead.state.hasData"
            :hasTotalSize="totalSerieSizeOnDisk > 0"
            >
            <template
              #loading
              >
              <Loading
                :isLoading="isLoadingSerieEpisodes && !episodeRead.state.hasData"
                :sentence="t('Research in progress...')"
                />
            </template>
          </EpisodePanel>
        </template>
      </MediaDialog>
    </div>
  </v-container>
</template>
