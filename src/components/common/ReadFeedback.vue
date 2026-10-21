<script setup lang="ts">
import { t } from '@/i18n';
import type { ReadState } from '@/composables/useReadRequest';
import { computed } from 'vue';
import { useDialogSnapshot } from '@/composables/useDialogSnapshot';

const props = withDefaults(defineProps<{ state: ReadState; label: string; disabled?: boolean; active?: boolean }>(), { active: true });
const { displayed } = useDialogSnapshot(() => props.active, () => ({ ...props.state }));
const view = computed(() => props.active ? props.state : displayed.value ?? props.state);
defineEmits<{ retry: [] }>();
</script>

<template>
  <v-alert v-if="view.error" :type="view.hasData ? 'warning' : 'error'" variant="tonal" class="mt-3" role="status" aria-live="polite">
    <div class="d-flex align-center justify-space-between flex-wrap ga-3">
      <div>
        <strong>{{ t(label) }}</strong>: {{ t(view.error) }}
        <div v-if="view.hasData" class="text-caption mt-1">{{ t("Showing last successful data. Changes are blocked until refreshed.") }}</div>
      </div>
      <v-btn variant="text" prepend-icon="mdi-refresh" :aria-label="t('Retry {p0}', { p0: t(label) })" :loading="view.loading" :disabled="view.loading || disabled || !active" @click="$emit('retry')">{{ t("Retry") }}</v-btn>
    </div>
  </v-alert>
</template>
