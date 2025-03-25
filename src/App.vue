<script setup lang="ts">

import { RouterView, useRouter } from 'vue-router'
import { ref, computed } from 'vue';
import { useResettable } from '@/composables/useResettable';

const router = useRouter();

const { state: drawer, reset: resetDrawer } = useResettable(false);
const { state: drawerSelected, reset: resetDrawerSelected } = useResettable('dashboard');
const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE);

const initialDrawerOptions = [
  {
    title: 'Dashboard',
    icon: 'mdi-view-dashboard-outline',
    value: 'dashboard'
  },
  {
    title: 'Library',
    icon: 'mdi-movie-open-outline',
    value: 'library'
  },
  {
    title: 'Outings',
    icon: 'mdi-filmstrip-box',
    value: 'outings'
  },
  {
    title: 'Settings',
    icon: 'mdi-cog-outline',
    value: 'settings'
  },
  {
    title: 'System',
    icon: 'mdi-server-outline',
    value: 'system'
  },
  {
    title: 'Sign Out',
    icon: 'mdi-logout',
    value: 'signout'
  }
];
const { state: drawerOptions, reset: resetDrawerOptions } = useResettable(initialDrawerOptions);

const filteredDrawerOptions = computed(() => {
  return drawerOptions.value.filter(option => {
    return ['settings', 'signout'].includes(option.value)
      ? useAPI.value === 'true'
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
        class="text-center"
        >
        <strong>Flix</strong> | WebApp
      </v-toolbar-title>
      <template
        v-slot:append
        >
        <div
          class="burger-compensator"
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
.burger-compensator {
  width: 48px;
}
</style>
