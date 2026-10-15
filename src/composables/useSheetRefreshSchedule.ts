import { onScopeDispose, watch } from 'vue';

export function useSheetRefreshSchedule(options: {
  context: () => unknown;
  enabled: () => boolean;
  refresh: () => Promise<unknown>;
}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let away = document.visibilityState === 'hidden';
  const active = () => !away && document.visibilityState !== 'hidden';
  const refresh = () => { if (options.enabled() && active()) void options.refresh(); };
  watch(options.context, (value, previous) => {
    if (Object.is(value, previous) || Array.isArray(value) && Array.isArray(previous)
      && value.length === previous.length && value.every((item, index) => Object.is(item, previous[index]))) return;
    clearInterval(timer);
    if (options.enabled()) timer = setInterval(refresh, 30000);
  }, { immediate: true, flush: 'sync' });
  function leave() { away = true; }
  function enter() {
    if (!away || document.visibilityState === 'hidden') return;
    away = false; refresh();
  }
  function visibility() { if (document.visibilityState === 'hidden') leave(); else enter(); }
  window.addEventListener('blur', leave);
  window.addEventListener('focus', enter);
  document.addEventListener('visibilitychange', visibility);
  onScopeDispose(() => {
    clearInterval(timer);
    window.removeEventListener('blur', leave);
    window.removeEventListener('focus', enter);
    document.removeEventListener('visibilitychange', visibility);
  });
  return { active };
}
