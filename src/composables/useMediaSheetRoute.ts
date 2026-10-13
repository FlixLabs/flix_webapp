import { watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFlixStore } from '@/stores/flixStore';
import { mediaQuery, mediaTarget } from './mediaLinks';
import type { MediaType } from './useMediaService';

interface SheetOptions {
  useAPI: Ref<boolean>;
  view: Ref<MediaType>;
  items: Record<MediaType, Ref<{ id: number }[]>>;
  dialogs: Record<MediaType, Ref<boolean>>;
  loaded: Ref<Record<MediaType, boolean>>;
  open: (type: MediaType, id: number) => void;
  showError: (message: string) => void;
}
export function useMediaSheetRoute(options: SheetOptions) {
  const route = useRoute(); const router = useRouter(); const store = useFlixStore();
  let pushedFromList = false; let errorPath = ''; let routeClosing = false; let instancePath = '';
  function closeFromRoute() { routeClosing = true; options.dialogs.movies.value = false; options.dialogs.series.value = false; }
  function report(message: string) {
    if (errorPath !== route.fullPath) { errorPath = route.fullPath; options.showError(message); }
  }
  watch([() => route.fullPath, options.items.movies, options.items.series, options.loaded, () => store.selectedInstance], () => {
    if (route.path !== '/library') return;
    const target = mediaTarget(route.query);
    if (!target) {
      instancePath = '';
      closeFromRoute();
      if (route.query.id !== undefined) report('Invalid media link. Select a media from the library.');
      else if (route.query.media === 'movies' || route.query.media === 'series') options.view.value = route.query.media;
      return;
    }
    if (options.useAPI.value && target.instance) {
      if (!store.instances.some(instance => instance.name === target.instance)) {
        closeFromRoute();
        report('The instance in this media link is unavailable.'); return;
      }
      if (instancePath !== route.fullPath) {
        instancePath = route.fullPath;
        if (store.selectedInstance !== target.instance) { closeFromRoute(); store.selectedInstance = target.instance; return; }
      } else if (store.selectedInstance !== target.instance) {
        closeFromRoute(); pushedFromList = false;
        const query = { ...route.query }; delete query.media; delete query.id; delete query.instance;
        void router.replace({ path: route.path, query, hash: route.hash }); return;
      }
    }
    options.view.value = target.type;
    if (!options.loaded.value[target.type]) return;
    const item = options.items[target.type].value.find(item => item.id === target.id);
    if (!item) { closeFromRoute(); report('This media is not available in the selected library.'); return; }
    routeClosing = false;
    options.dialogs[target.type === 'movies' ? 'series' : 'movies'].value = false;
    options.open(target.type, item.id);
  }, { immediate: true, deep: false, flush: 'post' });

  function openLink(type: MediaType, id: number) {
    if (!options.loaded.value[type] || !Number.isSafeInteger(id) || id <= 0) return;
    const sheetAlreadyOpen = !!mediaTarget(route.query);
    if (!sheetAlreadyOpen) pushedFromList = true;
    const location = { path: '/library', query: { ...route.query, ...mediaQuery(type, id, options.useAPI.value ? store.selectedInstance : null) }, hash: route.hash };
    void (sheetAlreadyOpen ? router.replace(location) : router.push(location));
  }
  watch([options.dialogs.movies, options.dialogs.series], ([movie, series], previous) => {
    if (routeClosing) { routeClosing = false; return; }
    if (movie || series || !previous.some(Boolean) || route.path !== '/library' || !mediaTarget(route.query)) return;
    if (pushedFromList) { pushedFromList = false; router.back(); }
    else {
      const query = { ...route.query }; delete query.media; delete query.id; delete query.instance;
      void router.replace({ path: route.path, query, hash: route.hash });
    }
  }, { flush: 'post' });
  return { openLink };
}
