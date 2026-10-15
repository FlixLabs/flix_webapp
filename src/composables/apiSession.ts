const api = () => String(import.meta.env.VITE_FLIX_API_URL ?? '').replace(/\/$/, '');
const storageKey = () => `flix-session:${api()}`;

export function clearApiSession() {
  try { localStorage.removeItem(storageKey()); sessionStorage.removeItem('flix_webapp_is_authenticated'); } catch { /* Storage may be blocked. */ }
}

export function saveApiSession(data: { enabled?: boolean; token?: string; expiresIn?: number }) {
  if (data.enabled === false) { clearApiSession(); return; }
  if (!/^[a-f0-9]{64}$/.test(data.token ?? '') || !Number.isFinite(data.expiresIn) || Number(data.expiresIn) <= 0) throw new Error('Invalid sign-in session.');
  localStorage.setItem(storageKey(), JSON.stringify({ token: data.token, expiresAt: Date.now() + Number(data.expiresIn) * 1000 }));
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
