<script setup lang="ts">
import type { StorageLocation } from "@/composables/useStorageLocations";

defineProps<{ title: string; locations: StorageLocation[] }>();
const threshold = Number(import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD);
</script>

<template>
  <v-card>
    <v-card-title>{{ title }}</v-card-title>
    <v-card-text v-if="!locations.length">No storage location available.</v-card-text>
    <v-table v-else>
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
