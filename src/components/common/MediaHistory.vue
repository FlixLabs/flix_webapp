<script setup lang="ts">
import { t, formatDate } from '@/i18n';
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
  return value && Number.isFinite(Date.parse(value)) ? formatDate(new Date(value)) : 'Date not provided';
}
defineExpose({ refresh: () => { if (expanded.value && !loading.value) void load(props.type, props.mediaId, page.value, true); } });
</script>

<template>
  <v-expansion-panels v-model="expanded" class="mt-4" :aria-label="t('Media history')">
    <v-expansion-panel :value="true" :title="t('Media history')">
      <v-expansion-panel-text>
        <p class="text-caption text-medium-emphasis mb-3">{{ t("Events reported by {p0}. This is not a complete audit of every Flix action.", { p0: type === 'movies' ? t("Radarr") : t("Sonarr") }) }}</p>
        <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-3">
          <span class="text-body-2">{{ error ? t("History unavailable") : loading ? t("Loading history...") : t("{p0} events", { p0: total }) }}</span>
          <v-btn variant="text" prepend-icon="mdi-refresh" :disabled="loading" @click="load(type, mediaId, page)">{{ error ? t("Retry history") : t("Refresh history") }}</v-btn>
        </div>
        <div class="history-progress"><v-progress-linear :active="loading" indeterminate color="primary" :aria-label="t('Loading media history')" /></div>
        <v-alert v-if="error" type="error" variant="tonal">{{ t(error) }}</v-alert>
        <v-alert v-if="!loading && !error && !records.length" type="info" variant="tonal">{{ t("No history reported for this media.") }}</v-alert>
        <v-list v-if="records.length" class="pa-0" :aria-label="t('History events')">
          <v-list-item v-for="(event, index) in records" :key="`${event.id}-${index}`" class="px-0 py-3">
            <v-chip size="small" :color="event.failed ? 'error' : 'primary'" variant="tonal">{{ t(event.label) }}</v-chip>
            <div class="text-caption text-medium-emphasis mt-1">{{ date(event.date) }}</div>
            <p class="text-body-2 text-break mt-2">{{ event.title }}</p>
            <p v-if="event.episode" class="text-body-2 text-break">{{ event.episode }}</p>
            <p v-if="event.quality" class="text-caption">{{ t("Quality: {p0}", { p0: event.quality }) }}</p>
            <dl v-if="event.details.length" class="mt-2">
              <div v-for="detail in event.details" :key="detail.label" class="mb-1">
                <dt class="text-caption text-medium-emphasis">{{ t(detail.label) }}</dt>
                <dd class="text-body-2 text-break ma-0">{{ detail.value }}</dd>
              </div>
            </dl>
            <v-divider v-if="index < records.length - 1" class="mt-3" />
          </v-list-item>
        </v-list>
        <v-pagination v-if="pageCount > 1 && !error" :model-value="page" :length="pageCount" :total-visible="3" :disabled="loading" :aria-label="t('History pages')" @update:model-value="load(type, mediaId, $event)" />
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<style scoped>
.history-progress { height: 4px; }
</style>
