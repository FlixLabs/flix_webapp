<script setup lang="ts">
import type { StorageLocation } from "@/composables/useStorageLocations";

defineProps<{ title: string; locations: StorageLocation[]; loading?: boolean; error?: string; interval?: number }>();
const emit = defineEmits<{ 'update:interval': [value: number] }>();
const threshold = Number(import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD);
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
    <v-progress-linear v-if="loading" indeterminate color="primary" />
    <v-card-text v-if="error" class="text-warning">{{ error }}</v-card-text>
    <v-card-text v-else-if="!locations.length && !loading">No storage location available.</v-card-text>
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
        <tr v-for="location in locations" :key="location.path">
          <td>
            {{ location.path }}
            <span v-if="!location.accessible" class="text-warning">(Unavailable)</span>
            <div v-if="location.sharedWith?.length" class="text-caption text-medium-emphasis">
              Shared volume: {{ location.sharedWith.join(', ') }}
            </div>
          </td>
          <td>{{ location.free === null ? 'Unavailable' : location.free.toFixed(2) }}</td>
          <td>{{ location.total === null ? 'Unavailable' : location.total.toFixed(2) }}</td>
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
            <span v-else>Unavailable</span>
          </td>
        </tr>
      </tbody>
    </v-table>
  </v-card>
</template>
