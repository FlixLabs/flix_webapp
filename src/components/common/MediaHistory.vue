<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaHistory, HISTORY_PAGE_SIZE } from '@/composables/useMediaHistory';
import type { MediaType } from '@/composables/useMediaService';

const props = defineProps<{ mediaId: number; type: MediaType }>();
const store = useFlixStore();
const expanded = ref(false);
const { records, total, page, loading, error, load, reset } = useMediaHistory({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'),
  selectedInstanceData: computed(() => store.selectedInstanceData),
});
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / HISTORY_PAGE_SIZE)));
watch(() => [props.mediaId, props.type, store.selectedInstanceData], () => {
  expanded.value = false;
  reset();
}, { flush: 'sync' });
watch(expanded, value => {
  if (value) void load(props.type, props.mediaId);
  else reset();
});
function date(value: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Date not provided';
}
</script>

<template>
  <v-expansion-panels v-model="expanded" class="mt-4" aria-label="Media history">
    <v-expansion-panel :value="true" title="Media history">
      <v-expansion-panel-text>
        <p class="text-caption text-medium-emphasis mb-3">Events reported by {{ type === 'movies' ? 'Radarr' : 'Sonarr' }}. This is not a complete audit of every Flix action.</p>
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
          <span class="text-body-2">{{ error ? 'History unavailable' : loading ? 'Loading history...' : `${total} events` }}</span>
          <v-btn variant="text" prepend-icon="mdi-refresh" :disabled="loading" @click="load(type, mediaId, page)">{{ error ? 'Retry history' : 'Refresh history' }}</v-btn>
        </div>
        <v-progress-linear v-if="loading" indeterminate color="primary" aria-label="Loading media history" />
        <v-alert v-else-if="error" type="error" variant="tonal">{{ error }}</v-alert>
        <v-alert v-else-if="!records.length" type="info" variant="tonal">No history reported for this media.</v-alert>
        <v-list v-else class="pa-0" aria-label="History events">
          <v-list-item v-for="(event, index) in records" :key="`${event.id}-${index}`" class="px-0 py-3">
            <v-chip size="small" :color="event.failed ? 'error' : 'primary'" variant="tonal">{{ event.label }}</v-chip>
            <div class="text-caption text-medium-emphasis mt-1">{{ date(event.date) }}</div>
            <p class="text-body-2 text-break mt-2">{{ event.title }}</p>
            <p v-if="event.episode" class="text-body-2 text-break">{{ event.episode }}</p>
            <p v-if="event.quality" class="text-caption">Quality: {{ event.quality }}</p>
            <dl v-if="event.details.length" class="mt-2">
              <div v-for="detail in event.details" :key="detail.label" class="mb-1">
                <dt class="text-caption text-medium-emphasis">{{ detail.label }}</dt>
                <dd class="text-body-2 text-break ma-0">{{ detail.value }}</dd>
              </div>
            </dl>
            <v-divider v-if="index < records.length - 1" class="mt-3" />
          </v-list-item>
        </v-list>
        <v-pagination v-if="pageCount > 1 && !error" :model-value="page" :length="pageCount" :total-visible="3" :disabled="loading" aria-label="History pages" @update:model-value="load(type, mediaId, $event)" />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>
