<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { t, formatDate } from '@/i18n';
import { useMediaService, type MediaServiceOptions, type MediaType } from '@/composables/useMediaService';
import { trackedImports, importServiceKey, importInProgress, importStatusColor, importStatusLabel, checkTrackedImport, dismissImport, type TrackedImport } from '@/composables/manualImportTracking';
import { useSheetRefreshSchedule } from '@/composables/useSheetRefreshSchedule';
const props = defineProps<{ options: MediaServiceOptions; paused?: boolean }>();
const emit = defineEmits<{ finished: [type: MediaType] }>();
const { getConfig, serviceContext } = useMediaService(props.options);
const records = computed(() => trackedImports.value.filter(item => {
  const config = getConfig(item.type);
  return config.base_url && config.api_key && item.service === importServiceKey(item.type, config);
}).slice().reverse());
const checking = ref<string[]>([]);
let disposed = false;
let refreshing = false;
async function check(item: TrackedImport) {
  if (disposed || props.paused || checking.value.includes(item.key)) return;
  checking.value.push(item.key);
  try {
    const updated = await checkTrackedImport(item.key, getConfig(item.type));
    if (!disposed && updated && updated.status !== item.status && updated.status === 'completed') emit('finished', item.type);
  } finally { checking.value = checking.value.filter(key => key !== item.key); }
}
async function refresh(all = false) {
  if (disposed || refreshing || props.paused || document.visibilityState === 'hidden') return;
  refreshing = true;
  try {
    for (const item of records.value) {
      if (disposed || props.paused) break;
      if (all || importInProgress(item.status) && !item.error) await check(item);
    }
  } finally { refreshing = false; }
}
watch(() => [serviceContext(), props.paused], () => { void refresh(true); }, { immediate: true });
useSheetRefreshSchedule({ context: serviceContext, enabled: () => records.value.length > 0, refresh: () => refresh(true) });
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { void refresh(); }, 5000); });
onScopeDispose(() => { disposed = true; clearInterval(timer); });
</script>

<template>
  <v-card v-if="records.length" class="mt-4">
    <v-card-title>{{ t('Manual imports') }}</v-card-title>
    <v-card-text>
      <p class="text-caption text-medium-emphasis mb-3">{{ t('Imports launched from this browser tab. Closing Flix does not cancel them.') }}</p>
      <div v-for="item in records" :key="item.key" class="import-activity-row">
        <div class="import-activity-title">
          <strong>{{ item.title }}</strong>
          <p class="text-caption text-medium-emphasis">{{ item.type === 'movies' ? t('Movie') : t('Series') }} · {{ t('Import command #{p0}', { p0: item.commandId }) }} · {{ formatDate(item.createdAt) }}</p>
          <p v-if="item.error" class="text-caption text-warning mt-1" role="status">{{ t(item.error) }}</p>
          <p v-else-if="item.status === 'unknown'" class="text-caption text-warning mt-1">{{ t('Import status unavailable') }}</p>
          <p v-else-if="item.status === 'completed'" class="text-caption text-medium-emphasis mt-1">{{ t('Check Downloads for any files that still need attention.') }}</p>
          <p v-else-if="['failed', 'aborted', 'cancelled'].includes(item.status)" class="text-caption text-error mt-1">{{ t('Import failed. Check the remaining download messages in Radarr or Sonarr.') }}</p>
        </div>
        <div class="d-flex align-center flex-wrap ga-2">
          <v-chip size="small" variant="tonal" :color="item.error ? 'warning' : importStatusColor(item.status)">{{ item.error ? t('Status unavailable') : t(importStatusLabel(item.status)) }}</v-chip>
          <v-btn color="primary" variant="text" size="small" prepend-icon="mdi-refresh" :loading="checking.includes(item.key)" :disabled="paused" :aria-label="t('Check import status for {p0}', { p0: item.title })" @click="check(item)">{{ t('Check status') }}</v-btn>
          <v-btn v-if="!importInProgress(item.status)" color="on-surface" variant="text" size="small" :aria-label="t('Dismiss import status for {p0}', { p0: item.title })" @click="dismissImport(item.key)">{{ t('Dismiss') }}</v-btn>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.import-activity-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-block: 12px; }
.import-activity-row + .import-activity-row { border-top: thin solid rgba(var(--v-border-color), var(--v-border-opacity)); }
.import-activity-title { flex: 1 1 240px; min-width: 0; overflow-wrap: anywhere; }
</style>
