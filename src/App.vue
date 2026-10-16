<script setup lang="ts">
import { t, interfaceLanguage } from '@/i18n';
import { apiFetch, signOut, sessionRole } from '@/composables/apiSession';

import { readApiJson, requireObject, requireList } from '@/composables/apiResponse';
import { sharedRead } from '@/composables/sharedRead';
import { useReadRequest } from '@/composables/useReadRequest';
import ReadFeedback from '@/components/common/ReadFeedback.vue';
import { useConnectivity } from '@/composables/useConnectivity';


import { RouterView, useRouter } from 'vue-router'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useFlixStore } from '@/stores/flixStore';
import { useResettable } from '@/composables/useResettable';
import { useAlert } from '@/composables/useAlert';
import Alert from '@/components/common/Alert.vue';
import Loading from '@/components/common/Loading.vue';
import { useDisplay } from 'vuetify';

const router = useRouter();
const online = useConnectivity();
const { xs } = useDisplay();

const { state: useAPI, reset: resetUseAPI } = useResettable(import.meta.env.VITE_FLIX_API_USE === 'true');

const { alert, showSuccessAlert, showErrorAlert } = useAlert();

const { state: drawer, reset: resetDrawer } = useResettable(false);
const { state: drawerSelected, reset: resetDrawerSelected } = useResettable('dashboard');

const store = useFlixStore();
const isLoadingInstances = ref(false);
const instanceRead = useReadRequest(() => useAPI.value);
const authenticationRead = useReadRequest(() => useAPI.value);
const showAuthenticationError = computed(() => !!router.currentRoute.value.meta.requiresAuth && !!authenticationRead.state.error);
watch(() => instanceRead.state.loading, value => { isLoadingInstances.value = value; }, { flush: 'sync' });

const initialDrawerOptions = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard-outline', value: 'dashboard' },
  { title: 'Library', icon: 'mdi-movie-open-outline', value: 'library' },
  { title: 'Calendar', icon: 'mdi-calendar-month', value: 'calendar' },
  { title: 'Outings', icon: 'mdi-filmstrip-box', value: 'outings' },
  { title: 'Downloads', icon: 'mdi-download-box-outline', value: 'downloads' },
  { title: 'Settings', icon: 'mdi-cog-outline', value: 'settings' },
  { title: 'System', icon: 'mdi-server-outline', value: 'system' },
  { title: 'Users', icon: 'mdi-account-group-outline', value: 'users' },
  { title: 'My account', icon: 'mdi-account-circle-outline', value: 'account' },
  { title: 'Sign Out', icon: 'mdi-logout', value: 'signout' }
];
const { state: drawerOptions, reset: resetDrawerOptions } = useResettable(initialDrawerOptions);

const filteredDrawerOptions = computed(() => {
  return drawerOptions.value.filter(option => {
    if (sessionRole.value === 'user') return ['account', 'signout'].includes(option.value);
    if (option.value === 'account') return false;
    if (option.value === 'users') return useAPI.value;
    return option.value === 'signout'
      ? useAPI.value && store.authenticationEnabled
      : true;
  });
});

const currentPage = computed(() => initialDrawerOptions.find(
  option => router.currentRoute.value.path === '/' + option.value
));

watch([() => currentPage.value?.title, interfaceLanguage], () => { document.title = `${t(currentPage.value?.title ?? 'Login')} | Flix`; }, { immediate: true });

function sessionExpired() {
  if (router.currentRoute.value.path !== '/login') void router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
}
window.addEventListener('flix-session-expired', sessionExpired);
onUnmounted(() => window.removeEventListener('flix-session-expired', sessionExpired));

const drawerSelectOption = async (option: any) => {
  if (option == 'signout') {
    try { await signOut(); } catch (error) { showErrorAlert(error); return; }
    router.push('/login');
    resetDrawer();
  } else {
    drawerSelected.value = option;
    resetDrawer();
  }
};

function getData() {
  if (sessionRole.value === 'user') { store.instances = []; return Promise.resolve(); }
  const read = instanceRead.begin();
  isLoadingInstances.value = true;
  let base_url = import.meta.env.VITE_FLIX_API_URL;

  return apiFetch(base_url + '/instances', { signal: read.signal, cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Unable to load instances');
      const json_data = await readApiJson(response);
      if (!read.isCurrent()) return;
      store.setInstances(requireList<import('@/composables/useMediaService').MediaInstance>(json_data, 'instances', ['name']));
      read.success();
    })
    .catch((error) => {
      read.fail(error);
    })
    .finally(() => {
      read.finish();
    });
}

function getAuthentication() {
    const read = authenticationRead.begin();
    return sharedRead(import.meta.env.VITE_FLIX_API_URL + '/auth')
      .then(json => {
        if (!read.isCurrent()) return;
        const data = requireObject<{ enabled?: boolean }>(json, 'authentication');
        store.authenticationEnabled = data.enabled === true;
        read.success();
      })
      .catch(read.fail).finally(read.finish);
}
watch(() => router.currentRoute.value.path, (path, previous) => {
  if (useAPI.value && ['/login', '/join'].includes(previous) && router.currentRoute.value.meta.requiresAuth) {
    void getData(); void getAuthentication();
    return;
  }
  if (useAPI.value && router.currentRoute.value.meta.requiresAuth && authenticationRead.state.error && !authenticationRead.state.loading) getAuthentication();
});
onMounted(async () => {
  await router.isReady();
  if (useAPI.value && router.currentRoute.value.meta.requiresAuth) {
    getData();
    getAuthentication();
  }
});
</script>

<template>
  <a class="flix-skip-link" href="#main-content">{{ t("Skip to content") }}</a>
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
          :aria-label="drawer ? t('Close navigation') : t('Open navigation')"
          :aria-expanded="drawer"
          @click.stop="drawer = !drawer"
          />
      </template>
      <v-toolbar-title
        :class="xs ? 'mx-3' : 'app-bar-title'"
        >
        <strong class="flix-brand text-primary">{{ t("Flix") }}</strong>
        <span v-if="!xs" class="text-caption text-medium-emphasis ml-3">{{ t("WebApp") }}</span>
      </v-toolbar-title>
      <template
        v-slot:append
        >
        <v-select
          v-if="useAPI && sessionRole !== 'user' && $route.meta.requiresAuth"
          class="mr-3"
          :width="xs ? 160 : undefined"
          :max-width="xs ? '45vw' : undefined"
          v-model="store.selectedInstance"
          :items="store.instances"
          item-title="name"
          item-value="name"
          :label="t('Instance')"
          variant="outlined"
          density="compact"
          hide-details
          >
          <template #append-inner>
            <v-btn icon="mdi-refresh" size="x-small" variant="text" :aria-label="t('Reload instances')" :loading="instanceRead.state.loading" :disabled="instanceRead.state.loading" @click.stop="getData" />
          </template>
        </v-select>
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
          :title="t(option.title)"
          :to="option.value != 'signout' ? '/' + option.value : undefined"
          color="primary"
          @click="drawerSelectOption(option.value)"
          />
      </v-list>
    </v-navigation-drawer>

    <v-main id="main-content" class="flix-main" tabindex="-1">
      <Alert :alert="alert" @update:alert="alert = $event" />
      <v-container v-if="!online || instanceRead.state.error || showAuthenticationError" class="pb-0">
        <v-alert v-if="!online" type="warning" variant="tonal" role="status">{{ t("Your browser reports it is offline. Some services may be unreachable.") }}</v-alert>
        <ReadFeedback :state="instanceRead.state" :label="t('API instances')" @retry="getData" />
        <ReadFeedback v-if="showAuthenticationError" :state="authenticationRead.state" :label="t('API authentication')" @retry="getAuthentication" />
      </v-container>
      <v-container v-if="currentPage" class="flix-page-heading pb-0">
        <div class="d-flex align-center ga-3">
          <v-icon :icon="currentPage.icon" color="primary" size="28" />
          <h1 class="flix-page-title">{{ t(currentPage.title) }}</h1>
        </div>
      </v-container>
      <RouterView v-if="!useAPI || !$route.meta.requiresInstance || store.selectedInstanceData" />
      <v-container v-else>
        <Loading :is-loading="isLoadingInstances" :sentence="t('Loading instances...')" />
        <v-alert v-if="!isLoadingInstances && !instanceRead.state.error" type="warning"> {{ t("No instance available. Please check the API configuration.") }} <v-btn variant="text" @click="getData">{{ t("Retry") }}</v-btn>
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
          <span class="text-caption text-medium-emphasis">{{ t("{p0} · Flix", { p0: new Date().getFullYear() }) }}</span>
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
