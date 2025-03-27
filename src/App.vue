<script setup lang="ts">

import { RouterView, useRouter } from 'vue-router'
import { ref, computed, watch, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';

const router = useRouter();

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: drawer, reset: resetDrawer } = useResettable(false);
const { state: drawerSelected, reset: resetDrawerSelected } = useResettable('dashboard');

const store = useFlixStore();

const initialDrawerOptions = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', value: 'dashboard' },
  { title: 'Library', icon: 'mdi-movie-open-outline', value: 'library' },
  { title: 'Outings', icon: 'mdi-filmstrip-box', value: 'outings' },
  { title: 'Settings', icon: 'mdi-cog-outline', value: 'settings' },
  { title: 'System', icon: 'mdi-server-outline', value: 'system' },
  { title: 'Sign Out', icon: 'mdi-logout', value: 'signout' }
];
const { state: drawerOptions, reset: resetDrawerOptions } = useResettable(initialDrawerOptions);

const filteredDrawerOptions = computed(() => {
  return drawerOptions.value.filter(option => {
    return ['settings', 'signout'].includes(option.value)
      ? useAPI.value
      : true;
  });
});

const drawerSelectOption = (option) => {
  if (option == 'signout') {
    sessionStorage.removeItem('flix_webapp_is_authenticated');
    router.push('/login');
    resetDrawer();
  } else {
    drawerSelected.value = option;
    resetDrawer();
  }
};

function getData() {
  let base_url = import.meta.env.VITE_FLIX_API_URL;

  fetch(base_url + '/instances')
    .then(async (response) => {
      const json_data = await response.json();
      store.setInstances(json_data);
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
    });
}

onMounted(() => {
  if (useAPI.value) {
    getData();
  }
});
</script>

<template>
  <v-app>
    <v-app-bar
      color="primary"
      density="compact"
      >
      <template
        v-slot:prepend
        >
        <v-app-bar-nav-icon
          @click.stop="drawer = !drawer"
          />
      </template>
      <v-toolbar-title
        class="app-bar-title"
        >
        <strong>Flix</strong> | WebApp
      </v-toolbar-title>
      <template
        v-slot:append
        >
        <v-select
          v-if="useAPI"
          v-model="store.selectedInstance"
          :items="store.instances"
          item-title="name"
          item-value="name"
          label="Instance"
          variant="outlined"
          hide-details
          />
      </template>
    </v-app-bar>

    <v-navigation-drawer
      v-model="drawer"
      >
      <v-list>
        <v-list-item
          v-for="option in filteredDrawerOptions"
          :key="option.value"
          :prepend-icon="option.icon"
          :title="option.title"
          :to="option.value != 'signout' ? '/' + option.value : undefined"
          :class="{ 'bg-blue-lighten-4': $route.path === '/' + option.value }"
          @click="drawerSelectOption(option.value)"
          />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <v-container>
        <RouterView/>
      </v-container>
    </v-main>

    <v-footer
      app
      color="primary"
      >
      <v-row>
        <v-col
          class="text-right"
          >
          {{ new Date().getFullYear() }} | <strong>Flix</strong>
        </v-col>
      </v-row>
    </v-footer>
  </v-app>
</template>

<style scoped>
.app-bar-title {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
}
</style>
