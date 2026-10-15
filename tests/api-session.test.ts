import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch, apiSessionToken, clearApiSession, saveApiSession, signOut } from '@/composables/apiSession';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) };
}
beforeEach(() => {
  vi.stubEnv('VITE_FLIX_API_URL', 'https://api.test');
  vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const token = 'a'.repeat(64);
it('persists the Flix session across resets, scoped by API, with expiry', () => {
  saveApiSession({ token, expiresIn: 2592000 });
  expect(apiSessionToken()).toBe(token);
  vi.stubEnv('VITE_FLIX_API_URL', 'https://second.test'); expect(apiSessionToken()).toBe('');
  vi.stubEnv('VITE_FLIX_API_URL', 'https://api.test'); expect(apiSessionToken()).toBe(token);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2592001 * 1000);
  expect(apiSessionToken()).toBe(''); vi.restoreAllMocks();
});
it('sends sessions only to the configured API, never third parties or redirects', async () => {
  saveApiSession({ token, expiresIn: 60 });
  const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal('fetch', fetch);
  await apiFetch('https://api.test/instances');
  expect(fetch.mock.calls[0]![1].headers.get('Authorization')).toBe(`Bearer ${token}`);
  expect(fetch.mock.calls[0]![1].redirect).toBe('error');
  for (const url of ['https://api.test.evil/instances', 'https://api.test@evil/instances', 'https://radarr.test/api/v3/movie']) {
    await apiFetch(url); expect(fetch.mock.lastCall![1].headers).toBeUndefined();
  }
});
it('revokes the API session on sign out and clears expired sessions on unauthorized responses', async () => {
  saveApiSession({ token, expiresIn: 60 });
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetch);
  await signOut(); expect(apiSessionToken()).toBe('');
  expect(fetch.mock.calls[0]![0]).toBe('https://api.test/session');
  expect(fetch.mock.calls[0]![1].method).toBe('DELETE');
  saveApiSession({ token, expiresIn: 60 });
  const expired = vi.fn(); window.addEventListener('flix-session-expired', expired);
  fetch.mockResolvedValue(new Response(null, { status: 401 }));
  await apiFetch('https://api.test/download-clients/Test');
  expect(apiSessionToken()).toBe(''); expect(expired).toHaveBeenCalledOnce();
});
it('rejects malformed sessions instead of accepting a browser-only authenticated flag', () => {
  expect(() => saveApiSession({ token: 'invalid', expiresIn: 60 })).toThrow();
  expect(apiSessionToken()).toBe(''); clearApiSession();
});
it('ignores a late unauthorized response from a session replaced by a new login', async () => {
  saveApiSession({ token, expiresIn: 60 });
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const request = apiFetch('https://api.test/instances');
  const next = 'b'.repeat(64); saveApiSession({ token: next, expiresIn: 60 });
  finish(new Response(null, { status: 401 })); await request;
  expect(apiSessionToken()).toBe(next);
});
it('keeps a session available for a safe sign-out retry if revocation could not be confirmed', async () => {
  saveApiSession({ token, expiresIn: 60 });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
  await expect(signOut()).rejects.toThrow();
  expect(apiSessionToken()).toBe(token);
});
