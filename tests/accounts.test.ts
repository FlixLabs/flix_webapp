import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { accountsApi, parseAccounts } from '@/composables/accounts';
beforeEach(() => vi.stubEnv('VITE_FLIX_API_URL', 'https://api.test'));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('explains missing account routes without decoding HTML errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<pre>Cannot GET /admin/accounts</pre>', { status: 404 })));
  await expect(accountsApi()).rejects.toThrow('Deploy the matching API version.');
});
it('normalizes invalid JSON and SPA fallback responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>')));
  await expect(accountsApi()).rejects.toThrow('Invalid JSON response');
});
it('preserves API errors and accepts empty mutation responses', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: 'This account already exists.' }, { status: 409 })).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetch);
  await expect(accountsApi('/invitations', { method: 'POST' })).rejects.toThrow('This account already exists.');
  await expect(accountsApi('/users/id', { method: 'PUT' })).resolves.toBeNull();
});
it('requires complete account data before enabling actions', () => {
  expect(parseAccounts({ users: [], invitations: [], mailConfigured: false })).toEqual({ users: [], invitations: [], mailConfigured: false });
  for (const value of [null, {}, { users: [], invitations: [], mailConfigured: 'true' }, { users: [{ id: '1', name: 'User', email: 'user@example.test' }], invitations: [], mailConfigured: true }, { users: [], invitations: [{ id: '1', email: 'user@example.test', delivery: 'queued', revoked: false, expiresAt: 'tomorrow' }], mailConfigured: true }]) expect(() => parseAccounts(value)).toThrow();
});
