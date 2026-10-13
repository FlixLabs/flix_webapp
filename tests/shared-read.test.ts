import { afterEach, expect, it, vi } from 'vitest';
import { sharedRead } from '@/composables/sharedRead';

afterEach(() => vi.unstubAllGlobals());

it('shares pending reads while giving each consumer its own data', async () => {
  let resolve!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal('fetch', fetch);
  const first = sharedRead('/auth');
  const second = sharedRead('/auth');
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(new Response(JSON.stringify({ nested: { value: 1 } })));
  const [a, b] = await Promise.all([first, second]) as { nested: { value: number } }[];
  a!.nested.value = 2;
  expect(b!.nested.value).toBe(1);
});

it('does not keep successful reads or share different credentials', async () => {
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await Promise.all([sharedRead('/movie?apikey=a'), sharedRead('/movie?apikey=b')]);
  expect(fetch).toHaveBeenCalledTimes(2);
  await sharedRead('/movie?apikey=a');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[0]).toEqual(['/movie?apikey=a', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) })]);
});

it('drops failed reads so a retry can succeed', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response('{"ok":true}'));
  vi.stubGlobal('fetch', fetch);
  const outcomes = await Promise.allSettled([sharedRead('/retry'), sharedRead('/retry')]);
  expect(outcomes.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await sharedRead('/retry')).toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('also drops synchronous fetch failures and invalid JSON', async () => {
  const fetch = vi.fn().mockImplementationOnce(() => { throw new Error('Offline'); })
    .mockResolvedValueOnce(new Response('bad JSON')).mockResolvedValueOnce(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await expect(sharedRead('/invalid')).rejects.toThrow('Offline');
  await expect(sharedRead('/invalid')).rejects.toThrow('Invalid JSON');
  await expect(sharedRead('/invalid')).resolves.toEqual({});
});
