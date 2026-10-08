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
    return option.value === 'signout'
      ? useAPI.value
      : true;
  });
});

const currentPage = computed(() => initialDrawerOptions.find(
  option => router.currentRoute.value.path === '/' + option.value
));

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
  <v-app class="flix-app">
    <v-app-bar
      color="surface"
      :elevation="0"
      class="flix-app-bar"
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
        <strong class="flix-brand text-primary">Flix</strong>
        <span v-if="!xs" class="text-caption text-medium-emphasis ml-3">WebApp</span>
      </v-toolbar-title>
      <template
        v-slot:append
        >
        <v-select
          v-if="useAPI"
          class="mr-3"
          :width="xs ? 160 : undefined"
          :max-width="xs ? '45vw' : undefined"
          v-model="store.selectedInstance"
          :items="store.instances"
          item-title="name"
          item-value="name"
          label="Instance"
          variant="outlined"
          density="compact"
          hide-details
          />
      </template>
    </v-app-bar>

    <v-navigation-drawer
      v-if="$route.meta.requiresAuth === true"
      v-model="drawer"
      color="surface"
      >
      <v-list class="pa-3" nav>
        <v-list-item
          v-for="option in filteredDrawerOptions"
          :key="option.value"
          :prepend-icon="option.icon"
          :title="option.title"
          :to="option.value != 'signout' ? '/' + option.value : undefined"
          color="primary"
          @click="drawerSelectOption(option.value)"
          />
      </v-list>
    </v-navigation-drawer>

    <v-main class="flix-main">
      <Alert :alert="alert" @update:alert="alert = $event" />
      <v-container v-if="currentPage" class="flix-page-heading pb-0">
        <div class="d-flex align-center ga-3">
          <v-icon :icon="currentPage.icon" color="primary" size="28" />
          <h1 class="flix-page-title">{{ currentPage.title }}</h1>
        </div>
      </v-container>
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
      color="background"
      class="flix-footer"
      >
      <v-row>
        <v-col
          class="text-right"
          >
          <span class="text-caption text-medium-emphasis">{{ new Date().getFullYear() }} &middot; Flix</span>
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
