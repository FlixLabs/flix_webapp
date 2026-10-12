<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaService, type MediaType } from '@/composables/useMediaService';
import { usePersistentPreference } from '@/composables/usePersistentPreference';
import { useCalendar, calendarDate, calendarDay, calendarRange, moveCalendar, matchesCalendarFilter, type CalendarEvent, type CalendarView, type CalendarFilter } from '@/composables/useCalendar';
import PageNavigation from '@/components/common/PageNavigation.vue';
import CalendarEventList from '@/components/common/CalendarEventList.vue';
import { useDisplay } from 'vuetify';

defineOptions({ name: 'FlixCalendar' });

const store = useFlixStore(); const router = useRouter();
const useAPI = ref(import.meta.env.VITE_FLIX_API_USE === 'true');
const selectedInstanceData = computed(() => store.selectedInstanceData);
const options = { useAPI, selectedInstanceData };
const { getConfig } = useMediaService(options);
const { events, loading, errors, load } = useCalendar(options);
const calendarValue = usePersistentPreference('calendar.date', calendarDay(new Date()), (value): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !!calendarDate(value) && calendarDay(calendarDate(value)!) === value);
const calendarType = usePersistentPreference<CalendarView>('calendar.view', 'month', (value): value is CalendarView => value === 'month' || value === 'week' || value === 'day');
const filter = usePersistentPreference<CalendarFilter>('calendar.filter', 'all', (value): value is CalendarFilter => value === 'all' || value === 'monitored' || value === 'missing' || value === 'available');
const mediaTypes = usePersistentPreference<MediaType[]>('calendar.media', ['movies', 'series'], (value): value is MediaType[] => Array.isArray(value) && value.every(item => item === 'movies' || item === 'series'));
const filterOptions = [{ title: 'All events', value: 'all' }, { title: 'Monitored', value: 'monitored' }, { title: 'Missing', value: 'missing' }, { title: 'Available', value: 'available' }];
const views = [{ title: 'Month', value: 'month' }, { title: 'Week', value: 'week' }, { title: 'Day', value: 'day' }];
const filteredEvents = computed(() => events.value.filter(event => matchesCalendarFilter(event, filter.value)));
const visibleEvents = computed(() => filteredEvents.value.filter(event => mediaTypes.value.includes(event.type)));
const { smAndDown } = useDisplay();
const layout = usePersistentPreference<'auto' | 'calendar' | 'agenda'>('calendar.layout', 'auto', (value): value is 'auto' | 'calendar' | 'agenda' => value === 'auto' || value === 'calendar' || value === 'agenda');
const displayLayout = computed({
  get: () => layout.value === 'auto' ? smAndDown.value ? 'agenda' : 'calendar' : layout.value,
  set: (value: 'calendar' | 'agenda') => { layout.value = value; },
});
const agendaPage = ref(1);
const agendaDays = computed(() => {
  const days = new Map<string, CalendarEvent[]>();
  for (const event of visibleEvents.value) {
    const day = calendarDay(event.start);
    days.set(day, [...(days.get(day) ?? []), event]);
  }
  return [...days].map(([date, events]) => ({ date, events }));
});
const agendaPages = computed(() => Math.max(1, Math.ceil(agendaDays.value.length / 7)));
const agendaSlice = computed(() => agendaDays.value.slice((agendaPage.value - 1) * 7, agendaPage.value * 7));
watch([visibleEvents, displayLayout], () => { agendaPage.value = 1; });
function dayTitle(value: string) { return calendarDate(value)?.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); }
const count = (type: MediaType) => filteredEvents.value.filter(event => event.type === type).length;
const title = computed(() => {
  const date = calendarDate(calendarValue.value)!;
  if (calendarType.value === 'month') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (calendarType.value === 'day') return date.toLocaleDateString(undefined, { dateStyle: 'long' });
  const range = calendarRange(calendarValue.value, 'week');
  return `${range.start.toLocaleDateString()} - ${range.end.toLocaleDateString()}`;
});
const dayEventsDialog = ref(false); const selectedDay = ref('');
const selectedDayTitle = computed(() => selectedDay.value ? calendarDate(selectedDay.value)?.toLocaleDateString(undefined, { dateStyle: 'long' }) : '');
const selectedDayEvents = computed(() => visibleEvents.value.filter(event => calendarDay(event.start) === selectedDay.value));
function openDayEvents(_event: Event, day: { date: string }) { selectedDay.value = day.date; dayEventsDialog.value = true; }
function mediaLink(event: CalendarEvent) { return { path: '/library', query: { media: event.type, id: String(event.mediaId) } }; }
function openMedia(_event: Event, scope: { event: unknown }) {
  const event = visibleEvents.value.find(event => event === scope.event);
  if (event?.mediaId) void router.push(mediaLink(event));
}
function setDate(value: unknown) { const date = calendarDate(value); if (date) calendarValue.value = calendarDay(date); }
function refresh() { return load(calendarValue.value, calendarType.value); }
const rangeKey = computed(() => {
  const range = calendarRange(calendarValue.value, calendarType.value);
  return `${calendarType.value}-${range.start.getTime()}-${range.end.getTime()}`;
});
watch([rangeKey, () => store.selectedInstance, () => getConfig('movies').base_url, () => getConfig('movies').api_key, () => getConfig('series').base_url, () => getConfig('series').api_key], () => {
  dayEventsDialog.value = false; void refresh();
}, { immediate: true });
</script>

<template>
  <v-container>
    <PageNavigation>
      <v-row align="center" density="compact">
        <v-col cols="12" md="6" class="d-flex align-center flex-wrap ga-2">
          <v-btn icon="mdi-chevron-left" variant="text" size="small" aria-label="Previous period" @click="calendarValue = moveCalendar(calendarValue, calendarType, -1)" />
          <v-btn variant="tonal" @click="setDate(new Date())">Today</v-btn>
          <v-btn icon="mdi-chevron-right" variant="text" size="small" aria-label="Next period" @click="calendarValue = moveCalendar(calendarValue, calendarType, 1)" />
          <span class="text-body-1" aria-live="polite">{{ title }}</span>
        </v-col>
        <v-col cols="6" md="3"><v-select v-model="calendarType" :items="views" label="Calendar view" variant="outlined" density="compact" hide-details /></v-col>
        <v-col cols="6" md="3"><v-select v-model="filter" :items="filterOptions" label="Event filter" variant="outlined" density="compact" hide-details /></v-col>
        <v-col cols="12" class="d-flex align-center justify-space-between flex-wrap ga-2">
          <v-btn-toggle v-model="mediaTypes" multiple color="primary" variant="outlined" density="comfortable" aria-label="Calendar media types">
            <v-btn value="movies" prepend-icon="mdi-movie-open-outline">Movies <span class="ml-1 text-medium-emphasis">({{ count('movies') }})</span></v-btn>
            <v-btn value="series" prepend-icon="mdi-television-classic">Series <span class="ml-1 text-medium-emphasis">({{ count('series') }})</span></v-btn>
          </v-btn-toggle>
          <v-btn-toggle v-model="displayLayout" mandatory color="primary" variant="outlined" density="comfortable" aria-label="Calendar layout">
            <v-btn value="calendar" prepend-icon="mdi-calendar-month-outline">Calendar</v-btn>
            <v-btn value="agenda" prepend-icon="mdi-format-list-bulleted">Agenda</v-btn>
          </v-btn-toggle>
          <v-btn variant="text" prepend-icon="mdi-refresh" :loading="loading" @click="refresh">Refresh calendar</v-btn>
        </v-col>
      </v-row>
    </PageNavigation>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mt-3" aria-label="Loading calendar" />
    <v-alert v-for="error in errors" :key="error" type="error" variant="tonal" class="mt-3">{{ error }}</v-alert>
    <v-alert v-if="!loading && !visibleEvents.length" type="info" variant="tonal" class="mt-3">{{ errors.length ? 'No events available from the loaded services.' : 'No events match this period and filters.' }}</v-alert>
    <v-sheet v-if="displayLayout === 'calendar'" height="clamp(420px, 68vh, 680px)" rounded="lg" border class="mt-3 calendar-surface overflow-hidden">
      <v-calendar :model-value="calendarValue" @update:model-value="setDate" :events="visibleEvents" event-name="title" :type="calendarType" :event-height="40" :event-margin-bottom="4" :event-color="event => event.type === 'movies' ? 'rgba(var(--v-theme-primary), 0.16)' : 'rgba(var(--v-theme-secondary), 0.16)'" event-text-color="rgb(var(--v-theme-on-surface))" :weekdays="[0, 1, 2, 3, 4, 5, 6]" @click:more="openDayEvents" @click:event="openMedia">
        <template #event="{ event }">
          <v-tooltip :text="event.title" location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="calendar-event-content" :class="event.type === 'movies' ? 'calendar-movie' : 'calendar-series'">
                <v-icon :icon="event.type === 'movies' ? 'mdi-movie-open-outline' : 'mdi-television-classic'" size="14" />
                <span class="calendar-event-title">{{ event.title }}</span>
                <v-icon v-if="event.hasFile === true" icon="mdi-check-circle-outline" size="13" color="success" />
              </span>
            </template>
          </v-tooltip>
        </template>
      </v-calendar>
    </v-sheet>
    <div v-else class="calendar-agenda mt-3" aria-label="Calendar agenda">
      <v-card v-for="day in agendaSlice" :key="day.date" variant="flat" border class="mb-3">
        <v-card-title class="d-flex align-center flex-wrap ga-2 text-body-1 py-3">
          <span class="font-weight-medium">{{ dayTitle(day.date) }}</span>
          <v-chip v-if="day.date === calendarDay(new Date())" color="primary" variant="tonal" size="small">Today</v-chip>
          <v-spacer />
          <span class="text-caption text-medium-emphasis">{{ day.events.length }} {{ day.events.length === 1 ? 'event' : 'events' }}</span>
        </v-card-title>
        <v-divider />
        <CalendarEventList :events="day.events.slice(0, 4)" />
        <v-card-actions v-if="day.events.length > 4">
          <v-btn variant="text" color="primary" @click="selectedDay = day.date; dayEventsDialog = true">Show all {{ day.events.length }} events</v-btn>
        </v-card-actions>
      </v-card>
      <v-pagination v-if="agendaPages > 1" v-model="agendaPage" :length="agendaPages" :total-visible="3" aria-label="Agenda pages" />
    </div>
  </v-container>
  <v-dialog v-model="dayEventsDialog" max-width="600" scrollable>
    <v-card>
      <v-card-title class="text-wrap">{{ selectedDayTitle }}</v-card-title>
      <v-card-subtitle>{{ selectedDayEvents.length }} {{ selectedDayEvents.length === 1 ? 'event' : 'events' }}</v-card-subtitle>
      <v-card-text>
        <CalendarEventList :events="selectedDayEvents" />
      </v-card-text>
      <v-card-actions><v-spacer /><v-btn color="primary" @click="dayEventsDialog = false">Close</v-btn></v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.calendar-event-content { display: flex; align-items: center; gap: 5px; height: 100%; min-width: 0; padding: 3px 6px; border-left: 3px solid rgb(var(--v-theme-primary)); }
.calendar-series { border-left-color: rgb(var(--v-theme-secondary)); }
.calendar-event-title { flex: 1; min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; white-space: normal; font-size: 0.75rem; line-height: 1.25; }
.calendar-surface :deep(.v-event) { border-radius: 5px; cursor: pointer; }
.calendar-surface :deep(.v-calendar-weekly__head-weekday) { padding-block: 10px; font-weight: 600; color: rgba(var(--v-theme-on-surface), 0.65); background: rgba(var(--v-theme-on-surface), 0.03); }
.calendar-surface :deep(.v-calendar-weekly__day.v-present .v-calendar-weekly__day-label .v-icon-btn) { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.14); }
.calendar-surface :deep(.v-calendar-weekly__day.v-present) { background: rgba(var(--v-theme-primary), 0.045); }
.calendar-surface :deep(.v-calendar-weekly__day.v-outside) { background: rgba(var(--v-theme-on-surface), 0.025); }
.calendar-surface :deep(.v-event-more) { color: rgb(var(--v-theme-primary)); font-weight: 600; }
.calendar-surface :deep(.v-event:focus-visible), .calendar-surface :deep(.v-event-more:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
@media (max-width: 600px) {
  .calendar-event-content { padding-inline: 3px; gap: 3px; }
  .calendar-event-content > :deep(.v-icon) { display: none; }
}
</style>
