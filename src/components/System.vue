<script setup lang="ts">

import { ref, onMounted, computed } from 'vue';

const initial_is_loading = false;
const is_loading = ref(initial_is_loading);
const reset_is_loading = () => {
  is_loading.value = structuredClone(initial_is_loading);
};

const initial_disk_data = {
  free_space: 0,
  total_space: 0,
  ratio: 0
}
const disk_data = ref(initial_disk_data);
const reset_disk_data = () => {
  disk_data.value = structuredClone(initial_disk_data);
};

const progress_color = computed(() => {
  return disk_data.value.ratio >= import.meta.env.VITE_SYSTEM_STORAGE_SPACE_TRESHOLD ? 'red' : 'blue';
});

function getDiskSpace() {
  const base_url = import.meta.env.VITE_RADARR_BASE_URL;
  const api_key = import.meta.env.VITE_RADARR_API_KEY;

  is_loading.value = true;

  fetch(base_url + '/api/v3/' + 'diskspace' + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      let root_disk = json_data.find((disk: any) => disk.path === '/') ||
                      json_data.find((disk: any) => disk.path === '/config');

      if (root_disk) {
        const free_space = Number((root_disk.freeSpace / 1048576 / 1024).toFixed(2));
        const total_space = Number((root_disk.totalSpace / 1048576 / 1024).toFixed(2));
        const ratio = Number(((1 - free_space / total_space) * 100).toFixed(2));

        disk_data.value = {
          free_space: free_space,
          total_space: total_space,
          ratio: ratio
        };
      }
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {
      reset_is_loading();
    });
}

onMounted(() => {
  getDiskSpace();
});
</script>

<template>
  <v-container>
    <v-card v-if="disk_data.free_space != 0 && disk_data.total_space != 0">
      <v-table>
        <thead>
          <tr>
            <th>Espace Libre (Go)</th>
            <th>Espace Total (Go)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ disk_data.free_space }}</td>
            <td>{{ disk_data.total_space }}</td>
            <td>
              <v-progress-linear
                :model-value="disk_data.ratio"
                 :color="progress_color"
                height="20"
                rounded
                >
                {{ disk_data.ratio }} %
              </v-progress-linear>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>
    <v-alert
      v-else-if="!is_loading"
      type="info"
      >
      No system information found
    </v-alert>
    <p
      v-if="is_loading"
      justify="center"
      align="center"
      class="mt-4"
      >
      <v-progress-circular
        indeterminate
        color="primary"
        size="50"
        />
      <span
        class="ml-2"
        >
        Loading data...
      </span>
    </p>
  </v-container>
</template>

<style scoped>

</style>
