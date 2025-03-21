<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { ref } from "vue";

const router = useRouter();

const initial_drawer = false;
const drawer = ref(initial_drawer);
const reset_drawer = () => {
  drawer.value = structuredClone(initial_drawer);
};

const initial_drawer_selected = 'dashboard';
const drawer_selected = ref(initial_drawer_selected);
const reset_drawer_selected = () => {
  drawer_selected.value = structuredClone(initial_drawer_selected);
};

const initial_drawer_options = [
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
const drawer_options = ref(initial_drawer_options);
const reset_drawer_options = () => {
  drawer_options.value = structuredClone(initial_drawer_options);
};

const drawer_select_option = (option) => {
  if (option == 'signout') {
    localStorage.removeItem('flix_webapp_is_authenticated');
    router.push('/login');
    reset_drawer();
  } else {
    drawer_selected.value = option;
    reset_drawer();
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
          v-for="option in drawer_options"
          :key="option.value"
          :prepend-icon="option.icon"
          :title="option.title"
          :to="option.value != 'signout' ? '/' + option.value : undefined"
          :class="{ 'bg-blue-lighten-4': $route.path === '/' + option.value }"
          @click="drawer_select_option(option.value)"
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
