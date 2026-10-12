<script setup lang="ts">
import type { CalendarEvent } from '@/composables/useCalendar';
defineProps<{ events: CalendarEvent[] }>();
</script>

<template>
  <v-list class="pa-0 bg-transparent" aria-label="Calendar events">
    <v-list-item
      v-for="event in events"
      :key="event.key"
      :to="event.mediaId ? { path: '/library', query: { media: event.type, id: String(event.mediaId) } } : undefined"
      :append-icon="event.mediaId ? 'mdi-chevron-right' : undefined"
      class="py-3 calendar-entry"
    >
      <template #prepend>
        <v-avatar :color="event.type === 'movies' ? 'primary' : 'secondary'" variant="tonal" rounded="lg" size="40" class="mr-3">
          <v-icon :icon="event.type === 'movies' ? 'mdi-movie-open-outline' : 'mdi-television-classic'" size="20" />
        </v-avatar>
      </template>
      <v-list-item-title class="text-wrap text-break text-body-2 font-weight-medium">{{ event.title }}</v-list-item-title>
      <div class="d-flex flex-wrap align-center ga-2 mt-2">
        <v-chip size="x-small" variant="tonal" :color="event.hasFile === true ? 'success' : undefined">
          {{ event.hasFile === true ? 'Available' : event.hasFile === false ? 'No local file' : 'File status unavailable' }}
        </v-chip>
        <span v-if="event.monitored === false" class="text-caption text-medium-emphasis">Unmonitored</span>
      </div>
    </v-list-item>
  </v-list>
</template>

<style scoped>
.calendar-entry :deep(.v-list-item__content) { min-width: 0; }
.calendar-entry + .calendar-entry { border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity)); }
</style>
