<script setup lang="ts">
import type { StorageLocation } from "@/composables/useStorageLocations";
import { computed } from 'vue';
import { storageDiagnostic } from '@/composables/storageDiagnostics';

const props = defineProps<{ title: string; locations: StorageLocation[]; loading?: boolean; error?: string; interval?: number; lastSuccessAt?: string }>();
const emit = defineEmits<{ 'update:interval': [value: number] }>();
const threshold = Number(import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD);
const diagnosed = computed(() => props.locations.map(location => ({ ...location, diagnostic: storageDiagnostic(location, threshold) })));
const capacityAlerts = computed(() => diagnosed.value.filter(location => ['full', 'saturated'].includes(location.diagnostic.state)));
</script>

<template>
  <v-card>
    <v-card-title>
      <v-row align="center">
        <v-col>{{ title }}</v-col>
        <v-col v-if="interval !== undefined">
          <v-text-field
            :model-value="interval"
            label="Interval (Seconds)"
            variant="outlined"
            type="number"
            min="0"
            hide-details
            @update:model-value="emit('update:interval', Number($event))"
          />
        </v-col>
      </v-row>
    </v-card-title>
    <div class="storage-progress"><v-progress-linear :active="!!loading" indeterminate color="primary" /></div>
    <v-card-text v-if="error">
      <v-alert type="warning" variant="tonal">{{ error }}</v-alert>
      <p v-if="lastSuccessAt" class="text-caption mt-2">Last valid measurements: {{ new Date(lastSuccessAt).toLocaleString() }}. Current capacity is unknown.</p>
    </v-card-text>
    <v-card-text v-else-if="!locations.length && !loading">No storage location available.</v-card-text>
    <v-card-text v-if="capacityAlerts.length">
      <v-alert v-for="location in capacityAlerts" :key="location.path" :type="location.diagnostic.state === 'full' ? 'error' : 'warning'" variant="tonal" class="mb-2">
        <strong>{{ location.diagnostic.message }}: {{ location.path || 'Not reported' }}</strong>
        <div>{{ location.diagnostic.hint }}</div>
      </v-alert>
    </v-card-text>
    <v-table v-if="locations.length">
      <thead>
        <tr>
          <th>Path</th>
          <th>Free Space (Go)</th>
          <th>Total Space (Go)</th>
          <th>Ratio</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="location in diagnosed" :key="location.path">
          <td>
            {{ location.path || 'Not reported' }}
            <div class="mt-1">
              <v-chip size="small" :color="location.diagnostic.color">{{ location.diagnostic.message }}</v-chip>
            </div>
            <div v-if="location.diagnostic.hint && !['full', 'saturated'].includes(location.diagnostic.state)" class="text-caption mt-1 storage-diagnostic">{{ location.diagnostic.hint }}</div>
            <div v-if="location.sharedWith?.length" class="text-caption text-medium-emphasis">
              Shared volume: {{ location.sharedWith.join(', ') }}
            </div>
          </td>
          <td>{{ location.free === null ? 'Not measured' : location.free.toFixed(2) }}</td>
          <td>{{ location.total === null ? 'Not measured' : location.total.toFixed(2) }}</td>
          <td>
            <v-progress-linear
              v-if="location.ratio !== null"
              :model-value="location.ratio"
              :color="location.ratio >= threshold ? 'red' : 'blue'"
              height="25"
              rounded
              striped
            >
              <strong>{{ Math.ceil(location.ratio) }} %</strong>
            </v-progress-linear>
            <span v-else>Not measured</span>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>

<style scoped>
.storage-progress { height: 4px; }
.storage-diagnostic {
  min-width: 160px;
  max-width: 340px;
  white-space: normal;
}
</style>
