import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, ref } from 'vue';
import { parseDownloadClients, useDownloadClients } from '@/composables/useDownloadClients';

const item = { id: 'a'.repeat(40), name: 'Torrent', state: 'Seeding', progress: 100, completed: true,
  sizeBytes: 1e9, path: '/downloads', ratio: 2, tracked: false, removable: true, removalBlockedReason: null };
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
  it('blocks importing, queued and unverifiable torrents even with force enabled', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    for (const removalBlockedReason of ['Import in progress', 'Import queued', 'Import status unavailable'] as const) {
      const blocked = { ...item, tracked: true, removable: false, removalBlockedReason };
      expect(await actions.remove({ ...client, allowForceRemoval: true }, blocked, false, true)).toBe(false);
      expect(() => parseDownloadClients({ clients: [{ ...client, torrents: [{ ...blocked, removable: true }] }] })).toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('disables cleanup when an older API does not report import protection', () => {
    const data = parseDownloadClients({ clients: [{ ...client, torrents: [{ ...item, removalBlockedReason: undefined }] }] });
    expect(data[0]!.torrents[0]!.removalBlockedReason).toBe('Import status unavailable');
    expect(data[0]!.torrents[0]!.removable).toBe(false);
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
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ clients: [{ ...client, torrents: [] }] })); vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    const tracked = { ...item, tracked: true, removable: false };
    expect(await actions.remove(client, tracked, false, true)).toBe(false);
    expect(await actions.remove({ ...client, allowForceRemoval: true }, { ...tracked, completed: false }, false, true)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await actions.remove({ ...client, allowForceRemoval: true }, tracked, false, true)).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ name: item.name, deleteData: false, force: true });
  });
  it('reloads the client after removal and includes newly completed torrents', async () => {
    const next = { ...item, id: 'b'.repeat(40), name: 'New completed torrent' };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ clients: [{ ...client, torrents: [next] }] }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    expect(await actions.remove(client, item, false)).toBe(true);
    expect(actions.clients.value[0]!.torrents.map(value => value.id)).toEqual([next.id]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![1].cache).toBe('no-store');
    expect(actions.message.value).toContain('Torrent removed');
  });
  it('does not hide a torrent still reported by the client or retry its removal', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ clients: [client] }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    expect(await actions.remove(client, item, false)).toBe(false);
    expect(actions.warning.value).toContain('still listed');
    expect(actions.message.value).toBe('');
    expect(actions.uncertain.value).toBe(true);
    expect(actions.clients.value[0]!.torrents).toHaveLength(1);
    await actions.remove(client, item, false);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('distinguishes accepted removal from an unavailable verification and recovers with refresh', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ clients: [{ ...client, torrents: [] }] }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    expect(await actions.remove(client, item, false)).toBe(false);
    expect(actions.warning.value).toContain('could not be verified');
    expect(actions.message.value).toBe('');
    await actions.load();
    expect(actions.warning.value).toBe('');
    expect(actions.uncertain.value).toBe(false);
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(1);
  });
  it('ignores a late response from a previously selected instance', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const { actions, instance } = setup(); const pending = actions.load();
    instance.value = 'Second'; finish(Response.json({ clients: [client] })); await pending;
    expect(actions.clients.value).toEqual([]);
  });
  it('cancels a refresh without clearing the closing view and ignores its late response', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ clients: [client] }))
      .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const { actions } = setup();
    await actions.load();
    actions.cancel();
    expect(actions.clients.value).toEqual([client]);
    const pending = actions.load();
    const snapshot = { clients: actions.clients.value, loading: actions.loading.value, error: actions.error.value };
    actions.cancel();
    expect(fetch.mock.calls[1]![1].signal.aborted).toBe(true);
    finish(Response.json({ clients: [client] }));
    await pending;
    expect({ clients: actions.clients.value, loading: actions.loading.value, error: actions.error.value }).toEqual(snapshot);
    actions.reset();
    expect(actions.loading.value).toBe(false);
    expect(actions.clients.value).toEqual([]);
  });
});
