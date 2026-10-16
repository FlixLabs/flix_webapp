<script setup lang="ts">
import { t } from '@/i18n';
import type { ReadState } from '@/composables/useReadRequest';

defineProps<{ state: ReadState; label: string; disabled?: boolean }>();
defineEmits<{ retry: [] }>();
</script>

<template>
  <v-alert v-if="state.error" :type="state.hasData ? 'warning' : 'error'" variant="tonal" class="mt-3" role="status" aria-live="polite">
    <div class="d-flex align-center justify-space-between flex-wrap ga-3">
      <div>
        <strong>{{ t(label) }}</strong>: {{ t(state.error) }}
        <div v-if="state.hasData" class="text-caption mt-1">{{ t("Showing last successful data. Changes are blocked until refreshed.") }}</div>
      </div>
      <v-btn variant="text" prepend-icon="mdi-refresh" :aria-label="t('Retry {p0}', { p0: t(label) })" :loading="state.loading" :disabled="state.loading || disabled" @click="$emit('retry')">{{ t("Retry") }}</v-btn>
    </div>
  </v-alert>
</template>
