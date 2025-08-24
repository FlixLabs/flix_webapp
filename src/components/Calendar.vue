<script setup lang="ts">

import { watch, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: calendarValue, reset: resetCalendarValue } = useResettable<any[]>([]);
const { state: calendarType, reset: resetCalendarType } = useResettable<'month' | 'week' | 'day'>('month');
const { state: events, reset: resetEvents } = useResettable<any[]>([]);

const { state: showMovies, reset: resetShowMovies } = useResettable(true);
const { state: showSeries, reset: resetShowSeries } = useResettable(true);

function getContent(type: 'movies' | 'series') {
  let base_url = '';
  let api_key = '';
  let url_type = 'calendar';
  let include = '';

  if (type == 'movies') {
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
    if (!useAPI.value) {
      base_url = import.meta.env.VITE_SONARR_BASE_URL;
      api_key = import.meta.env.VITE_SONARR_API_KEY;
    } else {
      const sid = selectedInstanceData.value as any;
      base_url = sid?.sonarr?.base_url ?? '';
      api_key = sid?.sonarr?.api_key ?? '';
    }

    include = '&includeSeries=true';
  }

  let date = new Date();
  const cv = calendarValue.value;
  if (Array.isArray(cv) && cv.length > 0) {
    const first = cv[0] as string | Date;
    date = new Date(first);
  }

  var y = date.getFullYear();
  var m = date.getMonth();
  var firstDay = new Date(y, m, 1);
  var lastDay = new Date(y, m + 1, 0);

  var year = String(y).padStart(2, '0');
  var month = String(m + 1).padStart(2, '0');
  var first = String(firstDay.getDate()).padStart(2, '0');
  var last = String(lastDay.getDate()).padStart(2, '0');

  var start = year + '-' + month + '-' + first;
  var end = year + '-' + month + '-' + last;

  fetch(base_url + '/api/v3/' + url_type + '?start=' + start + '&end=' + end + include + '&apikey=' + api_key)
    .then(async response => {
      const json_data = await response.json();

      let items = [];
      for (let item of json_data) {
        let title = null;

        if (type == 'movies') {
          if (item.inCinemas && m + 1 == new Date(item.inCinemas).getMonth() + 1) {
            title = item.title + ' (Cinemas)';

            items.push({
              title: title,
              start: new Date(item.inCinemas),
              end: new Date(item.inCinemas),
              color: 'blue'
            });
          }

          if (item.digitalRelease && m + 1 == new Date(item.digitalRelease).getMonth() + 1) {
            title = item.title + ' (Digital)';

            items.push({
              title: title,
              start: new Date(item.digitalRelease),
              end: new Date(item.digitalRelease),
              color: 'green'
            });
          }

          if (item.physicalRelease && m + 1 == new Date(item.physicalRelease).getMonth() + 1) {
            title = item.title + ' (Physical)';

            items.push({
              title: title,
              start: new Date(item.physicalRelease),
              end: new Date(item.physicalRelease),
              color: 'green'
            });
          }
        }

        if (type == 'series') {
          if (item.airDate && m + 1 == new Date(item.airDate).getMonth() + 1) {
            title = item.series.title + ' : ' + item.title + ' (airDate)';

            items.push({
              title: title,
              start: new Date(item.airDate),
              end: new Date(item.airDate),
              color: 'green'
            });
          }
        }
      }

      events.value = [...events.value, ...items];
    })
    .catch(error => {
      showErrorAlert(error);
    });
}

function loadContent() {
  if (showMovies.value) {
    getContent('movies');
  }
  if (showSeries.value) {
    getContent('series');
  }
}

watch([calendarValue, selectedInstance, showMovies, showSeries], () => {
  resetEvents();
  loadContent();
});

onMounted(() => {
  resetEvents();
  loadContent();
});
</script>

<template>
  <Alert
    :alert="alert"
    @update:alert="alert = $event"
    />
  <v-row>
    <v-switch
      label="Movies"
      inset
      v-model="showMovies"
      :color="showMovies ? 'green-lighten-1' : 'gray'"
      class="ml-5"
      />
    <v-switch
      label="Series"
      inset
      v-model="showSeries"
      :color="showSeries ? 'green-lighten-1' : 'gray'"
      class="ml-15"
      />
  </v-row>
  <v-row>
    <v-col>
      <v-calendar
        v-model="calendarValue"
        :events="events"
        :view-mode="calendarType"
        />
    </v-col>
  </v-row>
</template>

<style scoped>
:deep(.v-calendar .v-chip) {
  height: auto;
  width: 100%;
  border-radius: 8px !important;
  padding-top:5px;
  padding-bottom:5px;
}
:deep(.v-calendar .v-chip__content) {
  white-space: normal !important;
}
:deep(.v-calendar .v-chip:not(:last-child)) {
  margin-bottom: 5px;
}
</style>
