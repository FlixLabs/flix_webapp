<script setup lang="ts">
import { t, translatedChoices } from '@/i18n';
import { readApiJson, requireObject, requireList, optionalList } from '@/composables/apiResponse';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from '@/components/common/ReadFeedback.vue';


import { ref, computed, onMounted, watch, onUnmounted, nextTick } from 'vue';
import type { Ref } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaService } from '@/composables/useMediaService';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';
import DeleteConfirmationDialog from '@/components/common/DeleteConfirmationDialog.vue';
import { useDeleteConfirmation } from '@/composables/useDeleteConfirmation';
import { useDownloadActions } from '@/composables/useDownloadActions';
import { queueImportBlock } from '@/composables/queueImportProtection';
import { downloadDetails, showRawDownloadStatus } from '@/composables/useDownloadDetails';
import { downloadMediaId, downloadMediaTitle, useDownloadMediaSheet } from '@/composables/useDownloadMediaSheet';
import MediaDialog from '@/components/common/MediaDialog.vue';
import Loading from '@/components/common/Loading.vue';
import SeriesSizeField from '@/components/common/SeriesSizeField.vue';
import DownloadTitle from '@/components/common/DownloadTitle.vue';
import { useDownloadSourceLinks } from '@/composables/useDownloadSourceLinks';
import ManualImportDialog from '@/components/common/ManualImportDialog.vue';
import ManualImportActivity from '@/components/common/ManualImportActivity.vue';
import DownloadClientsDialog from '@/components/common/DownloadClientsDialog.vue';
import { canManualImport } from '@/composables/useManualImport';
import { latestTrackedImport, importStatusLabel, importStatusColor } from '@/composables/manualImportTracking';
import MediaTypeToggle from '@/components/common/MediaTypeToggle.vue';
import PageNavigation from '@/components/common/PageNavigation.vue';
import { usePersistentPreference, isMediaType } from '@/composables/usePersistentPreference';

const store = useFlixStore();
const clientsDialog = ref(false);

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig, serviceContext } = useMediaService({ useAPI, selectedInstanceData });
const sourceLinks = useDownloadSourceLinks({ useAPI, selectedInstanceData });
const importDialog = ref<InstanceType<typeof ManualImportDialog> | null>(null);
const importType = ref<'movies' | 'series'>('movies');
const importOptions = { useAPI, selectedInstanceData };
function importStatus(record: { downloadId?: unknown }) {
  return latestTrackedImport(mediaType.value, getConfig(mediaType.value), record.downloadId);
}
const mediaSheet = useDownloadMediaSheet(importOptions);
const { dialog: mediaDialog, type: detailType, item: detailItem, activator: detailActivator } = mediaSheet;
const detailSeriesSize = computed(() => {
  const stats = detailItem.value?.statistics;
  const value = stats && typeof stats === 'object' && 'sizeOnDisk' in stats ? stats.sizeOnDisk : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
});
function openDownloadMedia(record: { mediaId?: unknown; title?: string }, event: Event) {
  if (event.currentTarget instanceof HTMLElement) mediaSheet.open(mediaType.value, record, event.currentTarget);
}
function refreshImport() {
  getDownload(importType.value);
  getHistory(importType.value);
}

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { isRemoving, removeDownload } = useDownloadActions({
  useAPI, selectedInstanceData, showSuccessAlert, showErrorAlert,
  refreshDownloads: type => { getDownload(type); getHistory(type); },
});
const {
  deleteConfirmationDialog, itemToDelete, resetDeleteConfirmationDialog,
  resetItemToDelete, openDeleteConfirmationDialog, confirmDelete,
} = useDeleteConfirmation({ deleteItem: removeDownload });

const { state: isLoadingMovieRecords, reset: resetIsLoadingMovieRecords } = useResettable(false);
const { state: movieRecords, reset: resetMovieRecords } = useResettable<any[]>([]);
const { state: movieRecordsInterval, reset: resetMovieRecordsInterval } = useResettable(60);
const { state: isLoadingMovieHistory, reset: resetIsLoadingMovieHistory } = useResettable(false);
const { state: movieHistory, reset: resetMovieHistory } = useResettable<any[]>([]);
const { state: movieHistoryInterval, reset: resetMovieHistoryInterval } = useResettable(60);

const { state: isLoadingSerieRecords, reset: resetIsLoadingSerieRecords } = useResettable(false);
const { state: serieRecords, reset: resetSerieRecords } = useResettable<any[]>([]);
const { state: serieRecordsInterval, reset: resetSerieRecordsInterval } = useResettable(60);
const { state: isLoadingSerieHistory, reset: resetIsLoadingSerieHistory } = useResettable(false);
const { state: serieHistory, reset: resetSerieHistory } = useResettable<any[]>([]);
const { state: serieHistoryInterval, reset: resetSerieHistoryInterval } = useResettable(60);

const mediaType = usePersistentPreference('downloads.view', 'movies', isMediaType);
const view = ref<'queue' | 'history'>('queue');
const search = ref('');
const queueFilter = ref('all');
const queueFilterOptions = [
  { title: 'All downloads', value: 'all' },
  { title: 'Needs attention', value: 'attention' },
  { title: 'Download complete', value: 'ready' },
  { title: 'Downloading', value: 'downloading' },
  { title: 'Paused', value: 'paused' },
  { title: 'Waiting / importing', value: 'waiting' },
];
const page = ref(1);
const itemsPerPage = 10;
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
const activeRecords = computed(() => view.value === 'queue'
  ? mediaType.value === 'movies' ? movieRecords.value : serieRecords.value
  : mediaType.value === 'movies' ? movieHistory.value : serieHistory.value);
const filteredRecords = computed(() => {
  const term = (search.value ?? '').trim().toLocaleLowerCase();
  return activeRecords.value.filter(record =>
    (view.value !== 'queue' || queueFilter.value === 'all' || record.diagnosis?.kind === queueFilter.value)
    && `${record.title} ${record.mediaTitle ?? ''} ${record.status ?? ''} ${record.client ?? ''} ${record.messages?.join(' ') ?? ''}`.toLocaleLowerCase().includes(term));
});
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / itemsPerPage)));
const activeLoading = computed(() => view.value === 'queue'
  ? mediaType.value === 'movies' ? isLoadingMovieRecords.value : isLoadingSerieRecords.value
  : mediaType.value === 'movies' ? isLoadingMovieHistory.value : isLoadingSerieHistory.value);
const activeIntervalRef = computed(() => view.value === 'queue'
  ? mediaType.value === 'movies' ? movieRecordsInterval : serieRecordsInterval
  : mediaType.value === 'movies' ? movieHistoryInterval : serieHistoryInterval);
const activeInterval = computed({
  get: () => activeIntervalRef.value.value,
  set: value => { activeIntervalRef.value.value = value; },
});
const headers = computed(() => [
  { title: 'Title', key: 'title', width: view.value === 'queue' ? '38%' : '75%' },
  { title: 'Status', key: 'status', width: view.value === 'queue' ? '20%' : '25%' },
  ...(view.value === 'queue' ? [
    { title: 'Progress', key: 'progress', sortable: false, width: '25%' },
    { title: 'Actions', key: 'actions', sortable: false, width: '17%' },
  ] : []),
]);
function refreshActive() {
  if (isRemoving.value || activeRead.value.loading) return;
  if (view.value === 'queue') getDownload(mediaType.value);
  else getHistory(mediaType.value);
}
let away = document.visibilityState === 'hidden';
let returnRefresh: ReturnType<typeof setTimeout> | undefined;
function refreshOnReturn() {
  if (!away || document.visibilityState === 'hidden') return;
  away = false;
  if (activeRead.value.loading || isRemoving.value || deleteConfirmationDialog.value) return;
  clearTimeout(returnRefresh);
  returnRefresh = setTimeout(() => {
    if (!away && document.visibilityState !== 'hidden' && !deleteConfirmationDialog.value) refreshActive();
  }, 100);
}
function markAway() { away = true; }
function visibilityChanged() {
  if (document.visibilityState === 'hidden') markAway();
  else refreshOnReturn();
}
function pageRestored(event: PageTransitionEvent) {
  if (event.persisted) { markAway(); refreshOnReturn(); }
}
watch([mediaType, view, search, selectedInstance], () => { page.value = 1; });
watch(pageCount, value => { page.value = Math.min(page.value, value); });
watch([mediaType, view, page], async () => {
  await nextTick();
  navigation.value?.scrollToStart();
});

const reads = {
  movies: {
    queue: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('movies').base_url, getConfig('movies').api_key]),
    history: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('movies').base_url, getConfig('movies').api_key]),
  },
  series: {
    queue: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('series').base_url, getConfig('series').api_key]),
    history: useReadRequest(() => [useAPI.value, selectedInstance.value, getConfig('series').base_url, getConfig('series').api_key]),
  },
};
const activeRead = computed(() => reads[mediaType.value][view.value].state);
const actionsDisabled = computed(() => activeRead.value.loading || !!activeRead.value.error || !activeRead.value.hasData);
for (const type of ['movies', 'series'] as const) {
  watch(() => reads[type].queue.state.loading, loading => {
    (type === 'movies' ? isLoadingMovieRecords : isLoadingSerieRecords).value = loading;
  }, { flush: 'sync' });
  watch(() => reads[type].history.state.loading, loading => {
    (type === 'movies' ? isLoadingMovieHistory : isLoadingSerieHistory).value = loading;
  }, { flush: 'sync' });
}

function getDownload(type: 'movies' | 'series') {
  const read = reads[type].queue.begin();
  let base_url = '';
  let api_key = '';

  if (type == 'movies') {
    isLoadingMovieRecords.value = true;

    ({ base_url, api_key } = getConfig('movies'));
  }
  if (type == 'series') {
    isLoadingSerieRecords.value = true;

    ({ base_url, api_key } = getConfig('series'));
  }

  const params = new URLSearchParams({ apikey: api_key, [type === 'movies' ? 'includeMovie' : 'includeSeries']: 'true' });
  return fetch(base_url + '/api/v3/queue?' + params, { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      const json_data: any = requireObject(await readApiJson(response), 'downloads');
      requireList(json_data.records, 'download records');
      const currentConfig = getConfig(type);
      if (!read.isCurrent() || currentConfig.base_url !== base_url || currentConfig.api_key !== api_key) return;

      let items = [];
      for (let item of json_data.records) {
        let languages = [];

        for (let language of optionalList(item.languages, 'languages')) {
          languages.push(language.name);
        }

        items.push({
          id: item.id,
          mediaId: downloadMediaId(type, item),
          mediaTitle: downloadMediaTitle(type, item),
          metadata: type === 'movies' ? item.movie : item.series,
          downloadId: item.downloadId,
          infoUrl: item.infoUrl,
          outputPath: item.outputPath,
          trackedDownloadState: item.trackedDownloadState,
          title: item.title,
          date: item.added,
          indexer: item.indexer,
          client: item.downloadClient,
          languages: languages.join(', '),
          status: item.status,
          ...downloadDetails(item),
        });
      }

      if (type == 'movies') {
        movieRecords.value = items;
      }
      if (type == 'series') {
        serieRecords.value = items;
      }
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

function getHistory(type: 'movies' | 'series') {
  const read = reads[type].history.begin();
  let base_url = '';
  let api_key = '';

  if (type == 'movies') {
    isLoadingMovieHistory.value = true;

    ({ base_url, api_key } = getConfig('movies'));
  }
  if (type == 'series') {
    isLoadingSerieHistory.value = true;

    ({ base_url, api_key } = getConfig('series'));
  }

  return fetch(base_url + '/api/v3/history?apikey=' + api_key, { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      const json_data: any = requireObject(await readApiJson(response), 'downloads');
      requireList(json_data.records, 'download records');
      if (!read.isCurrent()) return;

      let items = [];
      for (let item of json_data.records) {
        let languages = [];

        for (let language of optionalList(item.languages, 'languages')) {
          languages.push(language.name);
        }

        items.push({
          id: item.id,
          mediaId: downloadMediaId(type, item),
          mediaTitle: downloadMediaTitle(type, item),
          metadata: type === 'movies' ? item.movie : item.series,
          title: item.sourceTitle,
          downloadId: item.downloadId,
          data: item.data,
          infoUrl: item.infoUrl,
          indexer: item.indexer,
          date: item.date,
          client: item.downloadClient,
          languages: languages.join(', '),
          status: item.eventType
        });
      }

      if (type == 'movies') {
        movieHistory.value = items;
      }
      if (type == 'series') {
        serieHistory.value = items;
      }
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

const intervalIds: Record<string, ReturnType<typeof setInterval>> = {};

const startInterval = (key: string, refVar: Ref<number>, callback: () => void) => {
  const existing = intervalIds[key];
  if (existing) {
    clearInterval(existing);
  }

  intervalIds[key] = setInterval(() => {
    const [type, view] = key.split(':') as ['movies' | 'series', 'queue' | 'history'];
    if (!reads[type][view].state.loading && !isRemoving.value) callback();
  }, refVar.value * 1000);
};

const watchAndStartInterval = (key: string, refVar: Ref<number>, callback: () => void) => {
  watch(refVar, () => {
    const v = Number(refVar.value);
    if (!Number.isNaN(v) && v > 0) {
      startInterval(key, refVar, callback);
    } else {
      clearInterval(intervalIds[key]);
      delete intervalIds[key];
    }
  });
};

const tasks: { key: string; refVar: Ref<number>; callback: () => void }[] = [
  { key: 'movies:queue', refVar: movieRecordsInterval, callback: () => getDownload('movies') },
  { key: 'movies:history', refVar: movieHistoryInterval, callback: () => getHistory('movies') },
  { key: 'series:queue', refVar: serieRecordsInterval, callback: () => getDownload('series') },
  { key: 'series:history', refVar: serieHistoryInterval, callback: () => getHistory('series') }
];

tasks.forEach(({ key, refVar, callback }) => {
  watchAndStartInterval(key, refVar, callback);
});

onMounted(() => {
  window.addEventListener('blur', markAway);
  window.addEventListener('focus', refreshOnReturn);
  window.addEventListener('pageshow', pageRestored);
  document.addEventListener('visibilitychange', visibilityChanged);
  getDownload('movies');
  getDownload('series');
  getHistory('movies');
  getHistory('series');

  tasks.forEach(({ key, refVar, callback }) => {
    const v = Number(refVar.value);
    if (!Number.isNaN(v) && v > 0) {
      startInterval(key, refVar, callback);
    }
  });
});

onUnmounted(() => {
  clearTimeout(returnRefresh);
  window.removeEventListener('blur', markAway);
  window.removeEventListener('focus', refreshOnReturn);
  window.removeEventListener('pageshow', pageRestored);
  document.removeEventListener('visibilitychange', visibilityChanged);
  Object.values(intervalIds).forEach(id => clearInterval(id));
});

watch(serviceContext, () => {
  resetDeleteConfirmationDialog();
  resetItemToDelete();
  resetMovieRecords();
  resetSerieRecords();
  resetMovieHistory();
  resetSerieHistory();
  getDownload('movies');
  getDownload('series');
  getHistory('movies');
  getHistory('series');
}, { flush: 'sync' });
</script>

<template>
  <Alert :alert="alert" @update:alert="alert = $event" />
  <DownloadClientsDialog v-if="useAPI && selectedInstanceData?.has_download_clients" v-model="clientsDialog" :instance="selectedInstance" />
  <MediaDialog v-if="detailItem" v-model="mediaDialog" :item="detailItem" :media-type="detailType === 'movies' ? 'Movie' : 'Serie'" :announcement-name="detailType === 'movies' ? 'Release' : 'Premiere'" :activator="detailActivator" :summary-visible="mediaSheet.state.hasData" :show-search="false" :show-add="false" :show-remove="false" :library-item="mediaSheet.state.hasData && !mediaSheet.state.error" read-only>
    <template #status>
      <Loading :is-loading="mediaSheet.state.loading" :sentence="t('Loading media...')" />
      <ReadFeedback :state="mediaSheet.state" :label="t('Download media')" @retry="mediaSheet.retry" />
    </template>
    <template v-if="detailType === 'series' && mediaSheet.state.hasData" #details>
      <SeriesSizeField :size="detailSeriesSize" :is-loading="false" :is-open="mediaDialog" />
    </template>
  </MediaDialog>
  <ManualImportDialog ref="importDialog" :options="importOptions" @requested="refreshImport" @finished="refreshImport" />
  <DeleteConfirmationDialog
    v-model="deleteConfirmationDialog"
    :message="`Remove '${itemToDelete.item?.title ?? ''}' from the queue and download client? Downloaded files may be deleted. The media will remain in your library.`"
    @confirm="confirmDelete"
    @cancel="resetItemToDelete"
  />
  <v-container>
    <PageNavigation ref="navigation">
      <v-text-field v-model="search" :label="t('Search')" variant="outlined" prepend-inner-icon="mdi-magnify" clearable hide-details />
      <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-3">
        <MediaTypeToggle
          v-model="mediaType"
          :total-movies="view === 'queue' ? movieRecords.length : movieHistory.length"
          :total-series="view === 'queue' ? serieRecords.length : serieHistory.length"
          :movies-pending="!reads.movies[view].state.hasData"
          :series-pending="!reads.series[view].state.hasData"
        />
        <v-btn-toggle v-model="view" color="primary" variant="outlined" mandatory :aria-label="t('Download view')">
          <v-btn value="queue" prepend-icon="mdi-download-outline">{{ t("Queue") }}</v-btn>
          <v-btn value="history" prepend-icon="mdi-history">{{ t("History") }}</v-btn>
        </v-btn-toggle>
        <v-select
          v-if="view === 'queue'"
          v-model="queueFilter"
          :items="translatedChoices(queueFilterOptions)"
          :label="t('Queue filter')"
          variant="outlined"
          density="compact"
          hide-details
          class="queue-filter"
        />
        <v-pagination
          v-if="pageCount > 1"
          v-model="page"
          :length="pageCount"
          :total-visible="$vuetify.display.xs ? 3 : 5"
          density="compact"
          :aria-label="t('Download pages')"
          rounded
        />
      </div>
    </PageNavigation>
    <ReadFeedback :state="activeRead" :label="`${mediaType === 'movies' ? t('Movie') : t('Series')} ${view === 'queue' ? 'downloads' : 'history'}`" :disabled="isRemoving" @retry="refreshActive" />
    <ManualImportActivity :options="importOptions" :paused="importDialog?.isOpen" @finished="type => { getDownload(type); getHistory(type); }" />
    <v-card class="mt-4">
      <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>{{ mediaType === 'movies' ? t("Movie") : t("Series") }} {{ view === 'queue' ? 'downloads' : 'history' }}</span>
        <v-btn v-if="useAPI && selectedInstanceData?.has_download_clients" variant="text" prepend-icon="mdi-download-network-outline" @click="clientsDialog = true">{{ t("Download clients") }}</v-btn>
        <v-btn variant="text" prepend-icon="mdi-refresh" :loading="activeLoading" @click="refreshActive">{{ t("Refresh") }}</v-btn>
      </v-card-title>
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" sm="8">
            <p class="text-caption text-medium-emphasis">{{ t("{p0} of {p1} loaded items. Search filters the loaded {p2}.", { p0: filteredRecords.length, p1: activeRecords.length, p2: view === 'queue' ? 'queue' : 'history' }) }}</p>
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="activeInterval" :label="t('Interval (Seconds)')" variant="outlined" type="number" min="1" density="compact" hide-details />
          </v-col>
        </v-row>
        <v-data-table
          v-model:page="page"
          :headers="translatedChoices(headers)"
          :items="filteredRecords"
          :items-per-page="itemsPerPage"
          :loading="activeLoading ? 'primary' : false"
          :mobile-breakpoint="600"
          hide-default-footer
          class="downloads-table mt-4"
          :no-data-text="activeRead.error ? t('Data unavailable. Retry to load this view.') : search || (view === 'queue' && queueFilter !== 'all') ? t('No matching items found') : view === 'queue' ? t('No download information found') : t('No history information found')"
        >
          <template #item.title="{ item }">
            <DownloadTitle :media-type="mediaType" :key="`${mediaType}-${view}-${item.id}`" :record="item" :source-context="serviceContext()" :resolve-source="sourceLinks.resolveInfo" :queue="view === 'queue'" @open="openDownloadMedia(item, $event)" />
          </template>
          <template #item.status="{ item }">
            <template v-if="view === 'queue'">
              <v-chip size="small" :color="item.diagnosis?.color">{{ t(item.diagnosis?.label) }}</v-chip>
              <template v-for="tracked in [importStatus(item)]" :key="tracked?.key">
                <div v-if="tracked" class="mt-2"><v-chip size="small" variant="tonal" :color="tracked.error ? 'warning' : importStatusColor(tracked.status)" prepend-icon="mdi-file-import-outline">{{ t('Manual import: {p0}', { p0: tracked.error ? t('Status unavailable') : t(importStatusLabel(tracked.status)) }) }}</v-chip></div>
              </template>
              <div v-if="showRawDownloadStatus(item.status, item.diagnosis?.label)" class="text-caption text-medium-emphasis mt-1 text-capitalize">{{ t(item.status) }}</div>
              <p v-if="item.blocked" class="download-warning text-caption mt-2"><v-icon icon="mdi-alert-circle-outline" size="16" class="mr-1" />{{ t(item.messages?.[0]) || t("No details provided by the service.") }}</p>
            </template>
            <span v-else class="text-capitalize">{{ t(item.status) || t("Unavailable") }}</span>
          </template>
          <template #item.progress="{ item }">
            <div class="download-progress">
              <div class="d-flex flex-wrap align-center justify-space-between ga-2 text-caption mb-2">
                <strong>{{ item.progressKnown ? `${Math.ceil(item.ratio)} %` : t("Progress not provided") }}</strong>
                <span class="text-medium-emphasis">{{ t("Time remaining: {p0}", { p0: item.timeLeft || t("Unavailable") }) }}</span>
              </div>
              <v-progress-linear v-if="item.progressKnown" :model-value="item.ratio" :color="item.blocked ? 'warning' : 'primary'" height="6" rounded :aria-label="t('Download progress for {p0}', { p0: item.title })" />
            </div>
          </template>
          <template #item.actions="{ item }">
            <div class="download-actions d-flex flex-wrap justify-end ga-1">
            <v-btn
              v-if="canManualImport(item)"
              color="primary"
              variant="text"
              size="small"
              prepend-icon="mdi-file-import-outline"
              :aria-label="t('Manual import {p0}', { p0: item.title })"
              :disabled="isRemoving || actionsDisabled"
              @click="importType = mediaType; importDialog?.open(mediaType, item)"
            >{{ t("Manual Import") }}</v-btn>
            <v-btn
              color="error"
              variant="text"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              :disabled="isRemoving || actionsDisabled || !Number.isInteger(item.id) || !item.downloadId || !!queueImportBlock(item.trackedDownloadState)"
              :aria-label="t('Remove {p0}', { p0: item.title })"
              @click="openDeleteConfirmationDialog(mediaType, item)"
            >{{ t("Remove") }}</v-btn>
            <span v-if="queueImportBlock(item.trackedDownloadState)" class="text-caption text-warning">{{ item.trackedDownloadState?.toLowerCase() === 'importpending' ? t('Automatic import pending; removal is protected.') : t(queueImportBlock(item.trackedDownloadState)) }}</span>
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.download-warning { color: rgb(var(--v-theme-warning)); overflow-wrap: anywhere; }
.download-actions { flex-direction: column; align-items: flex-end; }
.downloads-table :deep(table) { table-layout: fixed; }
.downloads-table :deep(.v-data-table__td) { padding-block: 12px; vertical-align: top; }
@media (max-width: 599px) {
  .download-actions { flex-direction: row; justify-content: flex-start !important; align-items: center; }
  .downloads-table :deep(table), .downloads-table :deep(tbody) { display: block; width: 100%; }
  .downloads-table :deep(thead), .downloads-table :deep(thead tr) { display: block; width: 100%; }
  .downloads-table :deep(thead th) { display: block; width: 100%; height: auto; padding: 0 0 12px; }
  .downloads-table :deep(.v-data-table__tr--mobile) { display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--flix-border); border-radius: 12px; margin-block: 12px; padding: 12px; background: rgb(var(--v-theme-surface)); }
  .downloads-table :deep(.v-data-table__tr--mobile > td) { display: block; width: 100%; height: auto; border: 0; padding: 6px 0; }
  .downloads-table :deep(.v-data-table__td-title) { display: none; }
  .downloads-table :deep(.v-data-table__td-value) { width: 100%; text-align: left; }
}
.queue-filter {
  flex: 0 1 220px;
  min-width: 180px;
}
.downloads-table :deep(.v-data-table__td-value) {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
