<script setup lang="ts">
import { computed } from 'vue';
import { t } from '@/i18n';
import { importStatusColor, importStatusLabel, normalizeImportStatus } from '@/composables/manualImportTracking';
const props = defineProps<{ status: string; commandId: number }>();
const state = computed(() => normalizeImportStatus(props.status));
const alertType = computed(() => state.value === 'completed' ? 'success' : ['failed', 'aborted', 'cancelled'].includes(state.value) ? 'error' : state.value === 'unknown' ? 'warning' : 'info');
</script>

<template>
  <v-alert :type="alertType" variant="tonal" role="status" aria-live="polite">
    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <strong>{{ state === 'completed' ? t('Import completed') : alertType === 'error' ? t('Import failed') : state === 'unknown' ? t('Import status unavailable') : t('Import launched') }}</strong>
      <v-chip size="small" variant="tonal" :color="importStatusColor(state)">{{ t(importStatusLabel(state)) }}</v-chip>
    </div>
    <p class="text-caption">{{ t('Import command #{p0}', { p0: commandId }) }}</p>
    <p class="mt-2">{{ state === 'completed' ? t('Check Downloads for any files that still need attention.') : alertType === 'error' ? t('Import failed. Check the remaining download messages in Radarr or Sonarr.') : t('Closing this window does not cancel the import.') }}</p>
  </v-alert>
</template>
