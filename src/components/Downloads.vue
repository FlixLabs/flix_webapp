<script setup lang="ts">

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
import { downloadDetails } from '@/composables/useDownloadDetails';
import DownloadDetails from '@/components/common/DownloadDetails.vue';
import MediaTypeToggle from '@/components/common/MediaTypeToggle.vue';
import PageNavigation from '@/components/common/PageNavigation.vue';
import { usePersistentPreference, isMediaType } from '@/composables/usePersistentPreference';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

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
const page = ref(1);
const itemsPerPage = 10;
const navigation = ref<InstanceType<typeof PageNavigation> | null>(null);
const activeRecords = computed(() => view.value === 'queue'
  ? mediaType.value === 'movies' ? movieRecords.value : serieRecords.value
  : mediaType.value === 'movies' ? movieHistory.value : serieHistory.value);
const filteredRecords = computed(() => {
  const term = (search.value ?? '').trim().toLocaleLowerCase();
  return activeRecords.value.filter(record => `${record.title} ${record.status ?? ''} ${record.client ?? ''}`.toLocaleLowerCase().includes(term));
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
  { title: 'Title', key: 'title' },
  { title: 'Status', key: 'status' },
  ...(view.value === 'queue' ? [
    { title: 'Progress', key: 'progress', sortable: false },
    { title: 'Actions', key: 'actions', sortable: false },
  ] : []),
]);
function refreshActive() {
  if (view.value === 'queue') getDownload(mediaType.value);
  else getHistory(mediaType.value);
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
watch([mediaType, view, search, selectedInstance], () => { page.value = 1; });
watch(pageCount, value => { page.value = Math.min(page.value, value); });
watch([mediaType, view, page], async () => {
  await nextTick();
  navigation.value?.scrollToStart();
});

const downloadRequestIds = { movies: 0, series: 0 };

function getDownload(type: 'movies' | 'series') {
  const requestId = ++downloadRequestIds[type];
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

  fetch(base_url + '/api/v3/queue?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();
      const currentConfig = getConfig(type);
      if (requestId !== downloadRequestIds[type] || currentConfig.base_url !== base_url || currentConfig.api_key !== api_key) return;

      let items = [];
      for (let item of json_data.records) {
        let languages = [];

        for (let language of item.languages ?? []) {
          languages.push(language.name);
        }

        items.push({
          id: item.id,
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
    })
    .catch((error) => {
      if (requestId === downloadRequestIds[type]) showErrorAlert(error);
    })
    .finally(() => {
      if (requestId !== downloadRequestIds[type]) return;
      if (type == 'movies') {
        resetIsLoadingMovieRecords();
      }
      if (type == 'series') {
        resetIsLoadingSerieRecords();
      }
    });
}

function getHistory(type: 'movies' | 'series') {
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

  fetch(base_url + '/api/v3/history?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data.records) {
        let languages = [];

        for (let language of item.languages) {
          languages.push(language.name);
        }

        items.push({
          id: item.id,
          title: item.sourceTitle,
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
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      if (type == 'movies') {
        resetIsLoadingMovieHistory();
      }
      if (type == 'series') {
        resetIsLoadingSerieHistory();
      }
    });
}

const intervalIds: Record<string, ReturnType<typeof setInterval>> = {};

const startInterval = (key: string, refVar: Ref<number>, callback: () => void) => {
  const existing = intervalIds[key];
  if (existing) {
    clearInterval(existing);
  }

  intervalIds[key] = setInterval(() => {
    callback();
  }, refVar.value * 1000);
};

const watchAndStartInterval = (key: string, refVar: Ref<number>, callback: () => void) => {
  watch(refVar, () => {
    const v = Number(refVar.value);
    if (!Number.isNaN(v) && v > 0) {
      startInterval(key, refVar, callback);
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
  Object.values(intervalIds).forEach(id => clearInterval(id));
});

watch(selectedInstance, () => {
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
  <DeleteConfirmationDialog
    v-model="deleteConfirmationDialog"
    :message="`Remove '${itemToDelete.item?.title ?? ''}' from the queue and download client? Downloaded files may be deleted. The media will remain in your library.`"
    @confirm="confirmDelete"
    @cancel="resetItemToDelete"
  />
  <v-container>
    <PageNavigation ref="navigation">
      <v-text-field v-model="search" label="Search" variant="outlined" prepend-inner-icon="mdi-magnify" clearable hide-details />
      <div class="d-flex flex-wrap align-center justify-space-between ga-3 mt-3">
        <MediaTypeToggle
          v-model="mediaType"
          :total-movies="view === 'queue' ? movieRecords.length : movieHistory.length"
          :total-series="view === 'queue' ? serieRecords.length : serieHistory.length"
        />
        <v-btn-toggle v-model="view" color="primary" variant="outlined" mandatory aria-label="Download view">
          <v-btn value="queue" prepend-icon="mdi-download-outline">Queue</v-btn>
          <v-btn value="history" prepend-icon="mdi-history">History</v-btn>
        </v-btn-toggle>
        <v-pagination
          v-if="pageCount > 1"
          v-model="page"
          :length="pageCount"
          :total-visible="$vuetify.display.xs ? 3 : 5"
          density="compact"
          aria-label="Download pages"
          rounded
        />
      </div>
    </PageNavigation>
    <v-card class="mt-4">
      <v-card-title class="d-flex flex-wrap align-center justify-space-between ga-3">
        <span>{{ mediaType === 'movies' ? 'Movie' : 'Series' }} {{ view === 'queue' ? 'downloads' : 'history' }}</span>
        <v-btn variant="text" prepend-icon="mdi-refresh" :loading="activeLoading" @click="refreshActive">Refresh</v-btn>
      </v-card-title>
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" sm="8">
            <p class="text-caption text-medium-emphasis">{{ filteredRecords.length }} of {{ activeRecords.length }} loaded items. Search filters the loaded {{ view === 'queue' ? 'queue' : 'history' }}.</p>
          </v-col>
          <v-col cols="12" sm="4">
            <v-text-field v-model="activeInterval" label="Interval (Seconds)" variant="outlined" type="number" min="1" density="compact" hide-details />
          </v-col>
        </v-row>
        <v-data-table
          v-model:page="page"
          :headers="headers"
          :items="filteredRecords"
          :items-per-page="itemsPerPage"
          :loading="activeLoading"
          :mobile-breakpoint="600"
          hide-default-footer
          class="downloads-table mt-4"
          :no-data-text="search ? 'No matching items found' : view === 'queue' ? 'No download information found' : 'No history information found'"
        >
          <template #item.title="{ item }">
            <div class="download-title">{{ item.title }}</div>
            <div class="text-caption text-medium-emphasis">{{ formatDate(item.date) }}</div>
            <div v-if="item.client" class="text-caption text-medium-emphasis">{{ item.client }}</div>
          </template>
          <template #item.status="{ item }"><span class="text-capitalize">{{ item.status || 'Unavailable' }}</span></template>
          <template #item.progress="{ item }">
            <v-progress-linear :model-value="item.ratio" color="primary" height="25" rounded striped>
              <strong>{{ Math.ceil(item.ratio) }} %</strong>
            </v-progress-linear>
            <DownloadDetails :record="item" />
          </template>
          <template #item.actions="{ item }">
            <v-btn
              color="error"
              variant="text"
              size="small"
              prepend-icon="mdi-trash-can-outline"
              :disabled="isRemoving || !Number.isInteger(item.id)"
              :aria-label="'Remove ' + item.title"
              @click="openDeleteConfirmationDialog(mediaType, item)"
            >Remove</v-btn>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.download-title {
  white-space: normal;
  overflow-wrap: anywhere;
}

.downloads-table :deep(.v-data-table__td-value) {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
