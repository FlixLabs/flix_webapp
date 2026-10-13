import { onScopeDispose, ref } from 'vue';

export function useConnectivity() {
  const online = ref(navigator.onLine !== false);
  const connected = () => { online.value = true; };
  const disconnected = () => { online.value = false; };
  window.addEventListener('online', connected);
  window.addEventListener('offline', disconnected);
  onScopeDispose(() => {
    window.removeEventListener('online', connected);
    window.removeEventListener('offline', disconnected);
  });
  return online;
}
