import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { readApiJson, requireList, requireObject } from './apiResponse';
import { useMediaService, type MediaServiceOptions } from './useMediaService';

export type IntegrationId = 'api' | 'radarr' | 'sonarr' | 'storage';
export type IntegrationState = 'idle' | 'checking' | 'available' | 'degraded' | 'unavailable' | 'unconfigured' | 'disabled';
export interface IntegrationStatus {
  id: IntegrationId;
  name: string;
  state: IntegrationState;
  message: string;
  checkedAt: string;
  lastSuccessAt: string;
  version: string;
}

class ServiceError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

export function useIntegrationStatus(options: MediaServiceOptions & { active: Ref<boolean> }) {
  const { getConfig } = useMediaService(options);
  const services = ref<IntegrationStatus[]>([
    { id: 'api', name: 'Flix API' }, { id: 'radarr', name: 'Radarr' },
    { id: 'sonarr', name: 'Sonarr' }, { id: 'storage', name: 'Storage Agent' },
  ].map(service => ({ ...service, id: service.id as IntegrationId, state: 'idle', message: '', checkedAt: '', lastSuccessAt: '', version: '' })));
  const requests = new Map<IntegrationId, AbortController>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let context = 0;

  function cancel() {
    context++;
    requests.forEach(request => request.abort());
    requests.clear();
    clearInterval(timer);
    timer = undefined;
    services.value.forEach(service => {
      if (service.state === 'checking') service.state = 'idle';
    });
  }

  async function check(id: IntegrationId) {
    if (!options.active.value) return;
    const service = services.value.find(item => item.id === id)!;
    requests.get(id)?.abort();
    requests.delete(id);
    const instance = options.selectedInstanceData.value;
    service.version = '';
    if ((id === 'api' || id === 'storage') && !options.useAPI.value) {
      service.state = 'disabled';
      service.message = 'Not used in standalone mode.';
      return;
    }
    if (id !== 'api' && options.useAPI.value && !instance) {
      service.state = 'unconfigured';
      service.message = 'Select an instance to check this integration.';
      return;
    }
    if (id === 'storage' && !instance?.has_storage_agent) {
      service.state = 'unconfigured';
      service.message = 'No storage agent configured for this instance.';
      return;
    }
    const config = id === 'radarr' || id === 'sonarr' ? getConfig(id === 'radarr' ? 'movies' : 'series') : null;
    const base = config?.base_url ?? import.meta.env.VITE_FLIX_API_URL;
    if (!base || (config && !config.api_key)) {
      service.state = 'unconfigured';
      service.message = 'Service URL or API key is missing.';
      return;
    }
    const endpoint = config ? '/api/v3/system/status' : id === 'api' ? '/instances' : `/storage/${encodeURIComponent(instance!.name)}`;
    const request = new AbortController();
    const generation = context;
    requests.set(id, request);
    service.state = 'checking';
    service.message = '';
    try {
      const response = await fetch(base.replace(/\/$/, '') + endpoint, {
        headers: config ? { 'X-Api-Key': config.api_key } : undefined,
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
        cache: 'no-store',
      });
      if (!response.ok) throw new ServiceError(response.status);
      const data = await readApiJson(response);
      let message = 'Service is reachable.';
      let degraded = false;
      let version = '';
      if (id === 'api') requireList(data, 'instances', ['name']);
      else if (id === 'storage') {
        const storage = requireObject(data, 'storage');
        const locations = requireList<{ id: string; available: boolean }>(storage.locations, 'storage locations', ['id']);
        if (typeof storage.collectedAt !== 'string' || locations.some(location => typeof location.available !== 'boolean')) {
          throw new Error('Invalid storage response.');
        }
        const unavailable = locations.filter(location => !location.available).map(location => location.id);
        degraded = unavailable.length > 0 || !locations.length;
        message = !locations.length ? 'Agent is reachable, but no storage measurements were returned.'
          : unavailable.length ? `Agent is reachable. Unavailable volumes: ${unavailable.join(', ')}.`
            : 'Agent is reachable and storage measurements are available.';
      } else {
        const status = requireObject(data, 'service status');
        if (typeof status.version !== 'string' || !status.version.trim()) throw new Error('Invalid service status response.');
        version = status.version;
      }
      if (request.signal.aborted || generation !== context) return;
      service.state = degraded ? 'degraded' : 'available';
      service.message = message;
      service.version = version;
      service.lastSuccessAt = new Date().toISOString();
    } catch (error) {
      if (request.signal.aborted || generation !== context) return;
      service.state = 'unavailable';
      if (error instanceof ServiceError) {
        service.message = [401, 403].includes(error.status) ? `Access denied (HTTP ${error.status}). Check the credentials.`
          : error.status === 404 ? 'Endpoint not found (HTTP 404). Check the service URL and configuration.'
            : id === 'storage' && error.status === 502 ? 'Flix API cannot reach the storage agent (HTTP 502).'
              : `Service request failed (HTTP ${error.status}).`;
      } else if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
        service.message = 'Service did not respond within 8 seconds.';
      } else if (error instanceof Error && error.message.startsWith('Invalid ')) {
        service.message = 'Service returned an invalid response.';
      } else {
        service.message = 'Service cannot be reached. Check the network, browser access and service availability.';
      }
    } finally {
      if (!request.signal.aborted && generation === context) service.checkedAt = new Date().toISOString();
      if (requests.get(id) === request) requests.delete(id);
    }
  }

  async function refresh() { await Promise.all(services.value.map(service => check(service.id))); }

  watch(() => [options.active.value, options.useAPI.value, options.selectedInstanceData.value], () => {
    cancel();
    services.value.forEach(service => Object.assign(service, { state: 'idle', message: '', version: '' }));
    if (options.active.value) {
      void refresh();
      timer = setInterval(() => {
        services.value.filter(service => service.state !== 'checking').forEach(service => void check(service.id));
      }, 60000);
    }
  }, { immediate: true });
  watch(() => [options.useAPI.value, options.selectedInstanceData.value], () => {
    services.value.forEach(service => { service.lastSuccessAt = ''; service.checkedAt = ''; });
  }, { flush: 'sync' });
  onScopeDispose(cancel);
  return { services, check, refresh };
}
