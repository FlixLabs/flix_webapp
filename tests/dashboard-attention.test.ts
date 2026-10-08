import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { needsAttention, useDashboardAttention } from '@/composables/useDashboardAttention';
afterEach(() => vi.unstubAllGlobals());
const instance = (name: string) => ({ name, has_storage_agent: true,
  radarr: { base_url: `http://${name}.test`, api_key: 'key', root_folder_path: '/movies' },
  sonarr: { base_url: `http://${name}.test`, api_key: 'key', root_folder_path: '/tv' },
});
describe('dashboard diagnostics', () => {
  it('includes failures and tracked warnings but not healthy downloads', () => {
    expect(needsAttention({ id: 1, title: 'Movie', status: 'downloading' })).toBe(false);
    expect(needsAttention({ id: 2, title: 'Movie', trackedDownloadStatus: 'warning' })).toBe(true);
    expect(needsAttention({ id: 3, title: 'Movie', errorMessage: 'No space' })).toBe(true);
  });
  it('reports unavailable sources rather than pretending all episodes exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')));
    const scope = effectScope();
    const actions = scope.run(() => useDashboardAttention({ useAPI: ref(true), selectedInstanceData: ref(instance('first')) }))!;
    await vi.waitFor(() => expect(actions.loading.value).toBe(false));
    expect(actions.errors.value).toHaveLength(3);
    expect(actions.missingCount.value).toBeNull();
    scope.stop();
  });
  it('aborts obsolete instance requests and ignores their late responses', async () => {
    const old: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
    vi.stubGlobal('fetch', vi.fn((url: string, options: { signal: AbortSignal }) => {
      if (url.includes('first.test')) return new Promise<Response>(resolve => old.push({ resolve, signal: options.signal }));
      return Promise.resolve(Response.json({ totalRecords: 0, records: [] }));
    }));
    const options = { useAPI: ref(true), selectedInstanceData: ref(instance('first')) };
    const scope = effectScope();
    const actions = scope.run(() => useDashboardAttention(options))!;
    options.selectedInstanceData.value = instance('second');
    expect(old.every(request => request.signal.aborted)).toBe(true);
    await vi.waitFor(() => expect(actions.loading.value).toBe(false));
    for (const request of old) request.resolve(Response.json({ totalRecords: 12, records: [{ id: 1, title: 'Old', errorMessage: 'Old error' }] }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(actions.blocked.value).toEqual([]);
    expect(actions.missingCount.value).toBe(0);
    scope.stop();
  });
});
