import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { parseDownloadClients, useDownloadClients } from '@/composables/useDownloadClients';

const item = { id: 'a'.repeat(40), name: 'Torrent', state: 'Seeding', progress: 100, completed: true,
  sizeBytes: 1e9, path: '/downloads', ratio: 2, tracked: false, removable: true };
const client = { id: 'main', name: 'Client', type: 'deluge', allowDeleteData: false, torrents: [item] };
const scopes: ReturnType<typeof effectScope>[] = [];
function setup() {
  const scope = effectScope(); scopes.push(scope);
  const instance = ref<string | null>('Test');
  const actions = scope.run(() => useDownloadClients(instance))!;
  return { actions, instance };
}
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });
describe('download clients', () => {
  it('rejects incomplete responses and inconsistent removal permissions', () => {
    expect(parseDownloadClients({ clients: [client] })).toEqual([client]);
    for (const data of [null, {}, { clients: [client, client] }, { clients: [{ ...client, torrents: [{ ...item, tracked: true }] }] },
      { clients: [{ ...client, torrents: [{ ...item, sizeBytes: -1 }] }] }]) expect(() => parseDownloadClients(data)).toThrow();
  });
  it('loads clients explicitly and resets results with the instance', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ clients: [client] })); vi.stubGlobal('fetch', fetch);
    const { actions, instance } = setup();
    expect(fetch).not.toHaveBeenCalled(); await actions.load();
    expect(fetch.mock.calls[0]![0]).toContain('/download-clients/Test');
    instance.value = 'Second';
    expect(actions.clients.value).toEqual([]);
  });
  it('blocks tracked torrents and data removal without server permission', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    expect(await actions.remove(client, { ...item, tracked: true, removable: true }, false)).toBe(false);
    expect(await actions.remove(client, item, true)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not retry an uncertain destructive request', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('Connection lost')); vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    await actions.remove(client, item, false); await actions.remove(client, item, false);
    expect(fetch).toHaveBeenCalledTimes(1); expect(actions.uncertain.value).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ name: item.name, deleteData: false });
  });
  it('forces only completed tracked torrents when the API supports it', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    const tracked = { ...item, tracked: true, removable: false };
    expect(await actions.remove(client, tracked, false, true)).toBe(false);
    expect(await actions.remove({ ...client, allowForceRemoval: true }, { ...tracked, completed: false }, false, true)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await actions.remove({ ...client, allowForceRemoval: true }, tracked, false, true)).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ name: item.name, deleteData: false, force: true });
  });
  it('ignores a late response from a previously selected instance', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const { actions, instance } = setup(); const pending = actions.load();
    instance.value = 'Second'; finish(Response.json({ clients: [client] })); await pending;
    expect(actions.clients.value).toEqual([]);
  });
});
