import { ref } from 'vue';

export const sessionRole = ref<'admin' | 'user' | null>(null);

const api = () => String(import.meta.env.VITE_FLIX_API_URL ?? '').replace(/\/$/, '');
const storageKey = () => `flix-session:${api()}`;

export function clearApiSession() {
  sessionRole.value = null;
  try { localStorage.removeItem(storageKey()); sessionStorage.removeItem('flix_webapp_is_authenticated'); } catch { /* Storage may be blocked. */ }
}

export function saveApiSession(data: { enabled?: boolean; token?: string; expiresIn?: number; role?: string }) {
  if (data.enabled === false) { clearApiSession(); return; }
  if (!/^[a-f0-9]{64}$/.test(data.token ?? '') || !Number.isFinite(data.expiresIn) || Number(data.expiresIn) <= 0) throw new Error('Invalid sign-in session.');
  localStorage.setItem(storageKey(), JSON.stringify({ token: data.token, expiresAt: Date.now() + Number(data.expiresIn) * 1000 }));
  sessionRole.value = data.role === 'user' ? 'user' : 'admin';
}

export async function verifySessionRole(): Promise<'admin' | 'user'> {
  const token = apiSessionToken();
  const response = await apiFetch(`${api()}/session`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (token !== apiSessionToken()) return verifySessionRole();
  if (!response.ok || data.authenticated !== true) { clearApiSession(); throw new Error('Sign in to Flix to continue.'); }
  sessionRole.value = data.role === 'user' ? 'user' : 'admin';
  return sessionRole.value;
}

export function apiSessionToken() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
    if (data && /^[a-f0-9]{64}$/.test(data.token) && data.expiresAt > Date.now()) return data.token as string;
  } catch { /* Invalid or unavailable storage is not an authenticated session. */ }
  return '';
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  // Never forward a Flix session to Radarr, Sonarr, TMDB, or a redirected host.
  const isAPI = !!api() && (url === api() || url.startsWith(`${api()}/`));
  if (!isAPI) return fetch(url, options);
  const headers = new Headers(options.headers);
  const token = apiSessionToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers, redirect: 'error' });
  if (response.status === 401 && !url.endsWith('/session') && token === apiSessionToken()) {
    clearApiSession();
    window.dispatchEvent(new Event('flix-session-expired'));
  }
  return response;
}

export async function signOut() {
  const response = await apiFetch(`${api()}/session`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Unable to confirm sign out. Please try again.');
  clearApiSession();
}
