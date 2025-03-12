<script setup lang="ts">

import { ref, onMounted } from 'vue';

const initial_disk_data = {
  free_space: 0,
  total_space: 0,
  ratio: 0
}
const disk_data = ref(initial_disk_data);
const reset_disk_data = () => {
  disk_data.value = structuredClone(initial_disk_data);
};

function getDiskSpace() {
  const base_url = import.meta.env.VITE_RADARR_BASE_URL;
  const api_key = import.meta.env.VITE_RADARR_API_KEY;

  fetch(base_url + '/api/v3/' + 'diskspace' + '?apikey=' + api_key)
    .then(async (response) => {
      const json_data = await response.json();

      const root_disk = json_data.find((disk: any) => disk.path == '/');

      const free_space = Number((root_disk.freeSpace / 1048576 / 1024).toFixed(2));
      const total_space = Number((root_disk.totalSpace / 1048576 / 1024).toFixed(2));
      const ratio = Number(((1 - free_space / total_space) * 100).toFixed(2));

      disk_data.value = {
        free_space: free_space,
        total_space: total_space,
        ratio: ratio
      };
    })
    .catch((error) => {
      console.error(error);
    })
    .finally(() => {

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
                color="blue"
                height="10"
                rounded
                />
                {{ disk_data.ratio }} %
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <p v-else>Chargement des données...</p>
  </v-container>
</template>

<style scoped>

</style>
