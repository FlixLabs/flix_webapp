<script setup lang="ts">

import { RouterView, useRouter } from 'vue-router'
import { ref, computed, watch, onMounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';
import Loading from '@/components/common/Loading.vue';
import { useDisplay } from 'vuetify';

const router = useRouter();
const { xs } = useDisplay();

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: drawer, reset: resetDrawer } = useResettable(false);
const { state: drawerSelected, reset: resetDrawerSelected } = useResettable('dashboard');

const store = useFlixStore();
const isLoadingInstances = ref(false);

const initialDrawerOptions = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', value: 'dashboard' },
  { title: 'Library', icon: 'mdi-movie-open-outline', value: 'library' },
  { title: 'Calendar', icon: 'mdi-calendar-month', value: 'calendar' },
  { title: 'Outings', icon: 'mdi-filmstrip-box', value: 'outings' },
  { title: 'Downloads', icon: 'mdi-download-box-outline', value: 'downloads' },
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

const drawerSelectOption = (option: any) => {
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
  isLoadingInstances.value = true;
  let base_url = import.meta.env.VITE_FLIX_API_URL;

  fetch(base_url + '/instances')
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to load instances');
      const json_data = await response.json();
      store.setInstances(json_data);
    })
    .catch((error) => {
      showErrorAlert(error);
    })
    .finally(() => {
      isLoadingInstances.value = false;
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
        v-if="$route.meta.requiresAuth === true"
        v-slot:prepend
        >
        <v-app-bar-nav-icon
          @click.stop="drawer = !drawer"
          />
      </template>
      <v-toolbar-title
        :class="xs ? 'mx-3' : 'app-bar-title'"
        >
        <strong>Flix</strong> | WebApp
      </v-toolbar-title>
      <template
        v-slot:append
        >
        <v-select
          v-if="useAPI"
          :width="xs ? 160 : undefined"
          :max-width="xs ? '45vw' : undefined"
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
      v-if="$route.meta.requiresAuth === true"
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
      <Alert :alert="alert" @update:alert="alert = $event" />
      <RouterView v-if="!useAPI || !$route.meta.requiresInstance || store.selectedInstanceData" />
      <v-container v-else>
        <Loading :is-loading="isLoadingInstances" sentence="Loading instances..." />
        <v-alert v-if="!isLoadingInstances" type="warning">
          No instance available. Please check the API configuration.
          <v-btn variant="text" @click="getData">Retry</v-btn>
        </v-alert>
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
