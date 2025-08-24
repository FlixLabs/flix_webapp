<script setup lang="ts">

import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Loading from '@/components/common/Loading.vue';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

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

function getDownload(type: 'movies' | 'series') {
  let base_url = '';
  let api_key = '';

  if (type == 'movies') {
    isLoadingMovieRecords.value = true;

    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.radarr?.base_url ?? '';
      api_key = sid?.radarr?.api_key ?? '';
    }
  }
  if (type == 'series') {
    isLoadingSerieRecords.value = true;

    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.sonarr?.base_url ?? '';
      api_key = sid?.sonarr?.api_key ?? '';
    }
  }

  fetch(base_url + '/api/v3/queue?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data.records) {
        let languages = [];
        const ratio = item.size > 0
          ? Number(((1 - item.sizeleft / item.size) * 100).toFixed(2))
          : 0;

        for (let language of item.languages) {
          languages.push(language.name);
        }

        items.push({
          title: item.title,
          date: item.added,
          indexer: item.indexer,
          client: item.downloadClient,
          languages: languages.join(', '),
          status: item.status,
          ratio: ratio
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
      showErrorAlert(error);
    })
    .finally(() => {
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

    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.radarr?.base_url ?? '';
      api_key = sid?.radarr?.api_key ?? '';
    }
  }
  if (type == 'series') {
    isLoadingSerieHistory.value = true;

    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.sonarr?.base_url ?? '';
      api_key = sid?.sonarr?.api_key ?? '';
    }
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
</script>

<template>
  <v-container>
    <v-row>
      <v-col
        md="6"
        >
        <h3>Radarr</h3>
        <v-row>
          <v-col>
            <v-card
              class="mt-4"
              >
              <v-card-title>
                Downloads
              </v-card-title>
              <v-card-text>
                <v-text-field
                  label="Interval (Seconds)"
                  variant="outlined"
                  v-model="movieRecordsInterval"
                  type="number"
                  class="mt-4"
                  />
                <v-table
                  v-if="movieRecords.length > 0"
                  >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <!--<th>Indexer</th>-->
                      <!--<th>Client</th>-->
                      <!--<th>Languages</th>-->
                      <th>Status</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="record in movieRecords"
                      :key="record.title"
                      >
                      <td>
                        <v-tooltip
                          :text="record.title"
                          >
                          <template #activator="{ props }">
                            <span v-bind="props" style="cursor:pointer;">
                              {{ record.title.length > 20 ? record.title.slice(0, 20) + '…' : record.title }}
                            </span>
                          </template>
                        </v-tooltip>
                      </td>
                      <td>{{ record.date }}</td>
                      <!--<td>{{ record.indexer }}</td>-->
                      <!--<td>{{ record.client }}</td>-->
                      <!--<td>{{ record.languages }}</td>-->
                      <td>{{ record.status.charAt(0).toUpperCase() + record.status.slice(1) }}</td>
                      <td>
                        <v-progress-linear
                          :model-value="record.ratio"
                          color="blue"
                          height="25"
                          rounded
                          striped
                          >
                          <strong>
                            {{ Math.ceil(record.ratio) }} %
                          </strong>
                        </v-progress-linear>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
                <v-alert
                  v-if="!isLoadingMovieRecords &&
                        !movieRecords.length"
                  type="info"
                  >
                  No download information found
                </v-alert>
                <Loading
                  :isLoading="isLoadingMovieRecords"
                  sentence="Loading data..."
                  />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card>
              <v-card-title>
                History
              </v-card-title>
              <v-card-text>
                <v-text-field
                  label="Interval (Seconds)"
                  variant="outlined"
                  v-model="movieHistoryInterval"
                  type="number"
                  class="mt-4"
                  />
                <v-table
                  v-if="movieHistory.length > 0"
                  >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <!--<th>Client</th>-->
                      <!--<th>Languages</th>-->
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="record in movieHistory"
                      :key="record.title"
                      >
                      <td>
                        <v-tooltip
                          :text="record.title"
                          >
                          <template #activator="{ props }">
                            <span v-bind="props" style="cursor:pointer;">
                              {{ record.title.length > 20 ? record.title.slice(0, 20) + '…' : record.title }}
                            </span>
                          </template>
                        </v-tooltip>
                      </td>
                      <td>{{ record.date }}</td>
                      <!--<td>{{ record.client }}</td>-->
                      <!--<td>{{ record.languages }}</td>-->
                      <td>{{ record.status.charAt(0).toUpperCase() + record.status.slice(1) }}</td>
                    </tr>
                  </tbody>
                </v-table>
                <v-alert
                  v-if="!isLoadingMovieHistory &&
                        !movieHistory.length"
                  type="info"
                  >
                  No history information found
                </v-alert>
                <Loading
                  :isLoading="isLoadingMovieHistory"
                  sentence="Loading data..."
                  />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
      <v-col
        md="6"
        >
        <h3>Sonarr</h3>
        <v-row>
          <v-col>
            <v-card
              class="mt-4"
              >
              <v-card-title>
                Downloads
              </v-card-title>
              <v-card-text>
                <v-text-field
                  label="Interval (Seconds)"
                  variant="outlined"
                  v-model="serieRecordsInterval"
                  type="number"
                  class="mt-4"
                  />
                <v-table
                  v-if="serieRecords.length > 0"
                  >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <!--<th>Indexer</th>-->
                      <!--<th>Client</th>-->
                      <!--<th>Languages</th>-->
                      <th>Status</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="record in serieRecords"
                      :key="record.title"
                      >
                      <td>
                        <v-tooltip
                          :text="record.title"
                          >
                          <template #activator="{ props }">
                            <span v-bind="props" style="cursor:pointer;">
                              {{ record.title.length > 20 ? record.title.slice(0, 20) + '…' : record.title }}
                            </span>
                          </template>
                        </v-tooltip>
                      </td>
                      <td>{{ record.date }}</td>
                      <!--<td>{{ record.indexer }}</td>-->
                      <!--<td>{{ record.client }}</td>-->
                      <!--<td>{{ record.languages }}</td>-->
                      <td>{{ record.status.charAt(0).toUpperCase() + record.status.slice(1) }}</td>
                      <td>
                        <v-progress-linear
                          :model-value="record.ratio"
                          color="blue"
                          height="25"
                          rounded
                          striped
                          >
                          <strong>
                            {{ Math.ceil(record.ratio) }} %
                          </strong>
                        </v-progress-linear>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
                <v-alert
                  v-if="!isLoadingSerieRecords &&
                        !serieRecords.length"
                  type="info"
                  >
                  No download information found
                </v-alert>
                <Loading
                  :isLoading="isLoadingSerieRecords"
                  sentence="Loading data..."
                  />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <v-card>
              <v-card-title>
                History
              </v-card-title>
              <v-card-text>
                <v-text-field
                  label="Interval (Seconds)"
                  variant="outlined"
                  v-model="serieHistoryInterval"
                  type="number"
                  class="mt-4"
                  />
                <v-table
                  v-if="serieHistory.length > 0"
                  >
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <!--<th>Client</th>-->
                      <!--<th>Languages</th>-->
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="record in serieHistory"
                      :key="record.title"
                      >
                      <td>
                        <v-tooltip
                          :text="record.title"
                          >
                          <template #activator="{ props }">
                            <span v-bind="props" style="cursor:pointer;">
                              {{ record.title.length > 20 ? record.title.slice(0, 20) + '…' : record.title }}
                            </span>
                          </template>
                        </v-tooltip>
                      </td>
                      <td>{{ record.date }}</td>
                      <!--<td>{{ record.client }}</td>-->
                      <!--<td>{{ record.languages }}</td>-->
                      <td>{{ record.status.charAt(0).toUpperCase() + record.status.slice(1) }}</td>
                    </tr>
                  </tbody>
                </v-table>
                <v-alert
                  v-if="!isLoadingSerieHistory &&
                        !serieHistory.length"
                  type="info"
                  >
                  No history information found
                </v-alert>
                <Loading
                  :isLoading="isLoadingSerieHistory"
                  sentence="Loading data..."
                  />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>
