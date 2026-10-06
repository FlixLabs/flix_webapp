<script setup lang="ts">

import { watch, computed, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaService } from '@/composables/useMediaService';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import { useDialog } from '@/composables/useDialog';
import Alert from '@/components/common/Alert.vue';

const store = useFlixStore();

const selectedInstance = computed(() => store.selectedInstance);
const selectedInstanceData = computed(() => store.selectedInstanceData);

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');
const { getConfig } = useMediaService({ useAPI, selectedInstanceData });

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: calendarValue, reset: resetCalendarValue } = useResettable<string | number | Date>(new Date());
const { state: calendarType, reset: resetCalendarType } = useResettable<'month' | 'week' | 'day'>('month');
interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  color: string;
}

const { state: events, reset: resetEvents } = useResettable<CalendarEvent[]>([]);
const { dialog: dayEventsDialog, reset: resetDayEventsDialog } = useDialog();
const { state: selectedDay } = useResettable('');

const selectedDayEvents = computed(() => events.value.filter(event => {
  const date = event.start;
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return day === selectedDay.value;
}));

const selectedDayTitle = computed(() => selectedDay.value
  ? new Date(selectedDay.value + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })
  : '');

function openDayEvents(_event: Event, day: { date: string }) {
  selectedDay.value = day.date;
  dayEventsDialog.value = true;
}

const { state: showMovies, reset: resetShowMovies } = useResettable(true);
const { state: showSeries, reset: resetShowSeries } = useResettable(true);

function getContent(type: 'movies' | 'series') {
  let base_url = '';
  let api_key = '';
  let url_type = 'calendar';
  let include = '';

  if (type == 'movies') {
    ({ base_url, api_key } = getConfig('movies'));
  }
  if (type == 'series') {
    ({ base_url, api_key } = getConfig('series'));

    include = '&includeSeries=true';
  }

  const date = new Date(calendarValue.value);

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
  resetDayEventsDialog();
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
  <v-container>
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
        <v-sheet height="600">
          <v-calendar
            v-model="calendarValue"
            :events="events"
            event-name="title"
            :type="calendarType"
            @click:more="openDayEvents"
            @click:event="(event, { day }) => openDayEvents(event, day)"
            >
            <template #event="{ event }">
              <v-tooltip :text="event.title" location="top">
                <template #activator="{ props }">
                  <span v-bind="props" class="d-block text-truncate px-1">
                    {{ event.title }}
                  </span>
                </template>
              </v-tooltip>
            </template>
          </v-calendar>
        </v-sheet>
      </v-col>
    </v-row>
  </v-container>
  <v-dialog v-model="dayEventsDialog" max-width="600" scrollable>
    <v-card>
      <v-card-title>{{ selectedDayTitle }}</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item v-for="(event, index) in selectedDayEvents" :key="index">
            <template #prepend>
              <v-icon :color="event.color" icon="mdi-circle" size="small" />
            </template>
            <v-list-item-title class="text-wrap">{{ event.title }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn color="primary" @click="resetDayEventsDialog">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
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
