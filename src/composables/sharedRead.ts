import { readApiJson } from './apiResponse';

const pending = new Map<string, Promise<unknown>>();

// Share only concurrent reads, never persisted results or mutation readbacks.
export async function sharedRead(url: string): Promise<unknown> {
  let request = pending.get(url);
  if (!request) {
    request = Promise.resolve().then(async () => {
      try {
        return await readApiJson(await fetch(url, {
          cache: 'no-store', signal: AbortSignal.timeout(15000),
        }));
      } finally {
        pending.delete(url);
      }
    });
    pending.set(url, request);
  }
  // Consumers enrich media objects independently, without mutating each other.
  return structuredClone(await request);
}
