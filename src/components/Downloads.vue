<script setup lang="ts">

import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: isLoadingMovie, reset: resetIsLoadingMovie } = useResettable(false);
const { state: movieRecords, reset: resetMovieRecords } = useResettable([]);
const { state: movieRecordsInterval, reset: resetMovieRecordsInterval } = useResettable(60);

const { state: isLoadingSerie, reset: resetIsLoadingSerie } = useResettable(false);
const { state: serieRecords, reset: resetSerieRecords } = useResettable([]);
const { state: serieRecordsInterval, reset: resetSerieRecordsInterval } = useResettable(60);

function getData(type) {
  let base_url = null;
  let api_key = null;

  if (type == 'movies') {
    isLoadingMovie.value = true;

    if (!useAPI.value) {
      base_url = import.meta.env.VITE_RADARR_BASE_URL;
      api_key = import.meta.env.VITE_RADARR_API_KEY;
    } else {
      base_url = selectedInstanceData.value.radarr.base_url;
      api_key = selectedInstanceData.value.radarr.api_key;
    }
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
        qualityMovie.value = any_profile.value;
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
        resetIsLoadingMovie();
      }
      if (type == 'series') {
        resetIsLoadingSerie();
      }
    });
}

const intervalIds = {};

const startInterval = (category, refVar, callback) => {
  const key = category;

  if (intervalIds[key]) {
    clearInterval(intervalIds[key]);
  }

  intervalIds[key] = setInterval(() => {
    callback();
  }, refVar.value * 1000);
};

const watchAndStartInterval = (category, refVar, callback) => {
  watch(refVar, () => {
    if (!isNaN(refVar.value) && refVar.value > 0) {
      startInterval(category, refVar, callback);
    }
  });
};

const tasks = [
  { category: 'movies', refVar: movieRecordsInterval, callback: () => getData('movies') },
  { category: 'series', refVar: serieRecordsInterval, callback: () => getData('series') }
];

tasks.forEach(({ category, refVar, callback }) => {
  watchAndStartInterval(category, refVar, callback);
});

const fetchDataOnMount = [
  { category: 'movies' },
  { category: 'series' }
];

onMounted(() => {
  fetchDataOnMount.forEach(({ category }) => getData(category));

  tasks.forEach(({ category, refVar, callback }) => {
    if (!isNaN(refVar.value) && refVar.value > 0) {
      startInterval(category, refVar, callback);
    }
  });
});

onUnmounted(() => {
  Object.values(intervalIds).forEach(clearInterval);
});
</script>

<template>
  <v-container>
    <v-row>
      <v-col
        md="6"
        >
        <h3>Radarr</h3>
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
              <td>{{ record.title.substr(0, 20) + '...' }}</td>
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
          v-if="!isLoadingMovie &&
                !movieRecords.length"
          type="info"
          >
          No download information found
        </v-alert>
        <p
          v-if="isLoadingMovie"
          justify="center"
          align="center"
          >
          <v-progress-circular
            indeterminate
            color="primary"
            size="50"
            />
          <span
            class="ml-2"
            >
            Loading data...
          </span>
        </p>
      </v-col>
      <v-col
        md="6"
        >
        <h3>Sonarr</h3>
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
              <td>{{ record.title.substr(0, 20) + '...' }}</td>
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
          v-if="!isLoadingSerie &&
                !serieRecords.length"
          type="info"
          >
          No download information found
        </v-alert>
        <p
          v-if="isLoadingSerie"
          justify="center"
          align="center"
          >
          <v-progress-circular
            indeterminate
            color="primary"
            size="50"
            />
          <span
            class="ml-2"
            >
            Loading data...
          </span>
        </p>
      </v-col>
    </v-row>
  </v-container>
</template>
