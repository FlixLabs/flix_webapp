<script setup lang="ts">
import { t } from '@/i18n';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useMediaMonitoring, type MonitoredMedia } from '@/composables/useMediaMonitoring';
import type { MediaType } from '@/composables/useMediaService';

const props = defineProps<{ item: MonitoredMedia; type: MediaType; disabled?: boolean }>();
const emit = defineEmits<{ busy: [value: boolean] }>();
const store = useFlixStore();
const { pending, error, reset, setMonitoring, refreshMonitoring } = useMediaMonitoring({
  useAPI: ref(import.meta.env.VITE_FLIX_API_USE === 'true'),
  selectedInstanceData: computed(() => store.selectedInstanceData),
});
watch(() => props.item, reset, { flush: 'sync' });
const controlRevision = ref(0);
watch(pending, value => {
  emit('busy', value);
  // Restore native checkbox state when an update fails without changing the model.
  if (!value && error.value) controlRevision.value++;
}, { flush: 'sync' });
onBeforeUnmount(() => emit('busy', false));
onMounted(() => {
  if (props.item.monitoringNeedsRefresh) refreshMonitoring(props.type, props.item);
});
const seasons = computed(() => [...(props.item.seasons || [])].sort((a, b) => a.seasonNumber - b.seasonNumber));
</script>

<template>
  <div class="mt-4 media-monitoring">
    <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ t(error) }}</v-alert>
    <div class="d-flex align-center flex-wrap ga-3">
      <v-switch
        v-if="typeof item.monitored === 'boolean'"
        :key="controlRevision"
        :label="type === 'movies' ? t('Monitor movie') : t('Monitor series')"
        :model-value="item.monitored"
        :disabled="pending || disabled || !!error"
        :loading="pending"
        color="primary"
        hide-details
        @update:model-value="setMonitoring(type, item, $event === true)"
      />
      <span v-else class="text-body-2 text-medium-emphasis">{{ t("Monitoring status not provided") }}</span>
      <v-btn
        v-if="error || typeof item.monitored !== 'boolean'"
        variant="text"
        :loading="pending"
        :disabled="pending || disabled"
        @click="refreshMonitoring(type, item)"
      >{{ t("Reload monitoring") }}</v-btn>
      <span class="text-caption text-medium-emphasis">{{ t("No search or file deletion is triggered.") }}</span>
    </div>
    <v-expansion-panels v-if="type === 'series' && seasons.length" class="mt-3">
      <v-expansion-panel :title="t('Season monitoring')">
        <v-expansion-panel-text>
          <p v-if="!item.monitored" class="text-caption text-medium-emphasis mb-2">{{ t("Enable series monitoring to monitor individual seasons.") }}</p>
          <v-row>
            <v-col v-for="season in seasons" :key="season.seasonNumber" cols="12" sm="6">
              <v-switch
                :key="controlRevision"
                :label="season.seasonNumber === 0 ? t('Monitor specials') : t('Monitor season {p0}', { p0: season.seasonNumber })"
                :model-value="season.monitored"
                :disabled="pending || disabled || !!error || !item.monitored"
                color="primary"
                hide-details
                @update:model-value="setMonitoring('series', item, $event === true, season.seasonNumber)"
              />
            </v-col>
          </v-row>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>
