import { apiFetch } from './apiSession';
import { requireList, requireObject } from './apiResponse';

export type AccountUser = { id: string; name: string; email: string; disabled: boolean };
export type AccountInvitation = { id: string; email: string; delivery: string; revoked: boolean; expiresAt: number };

export async function accountsApi(path = '', options: RequestInit = {}) {
  const response = await apiFetch(`${import.meta.env.VITE_FLIX_API_URL.replace(/\/$/, '')}/admin/accounts${path}`, {
    ...options, cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(15000),
  });
  if (!path && (response.status === 404 || response.status === 405)) {
    throw new Error('User management is unavailable on this API. Deploy the matching API version.');
  }
  if (response.status === 204 && response.ok) return null;
  let data;
  try { data = requireObject(await response.json()); }
  catch { throw new Error('Invalid JSON response from the service. Please try again.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to manage users.');
  return data;
}

export function parseAccounts(value: unknown) {
  const data = requireObject(value);
  const users = requireList<AccountUser>(data.users, 'users', ['id', 'name', 'email']);
  const invitations = requireList<AccountInvitation>(data.invitations, 'invitations', ['id', 'email', 'delivery']);
  if (typeof data.mailConfigured !== 'boolean' || users.some(user => typeof user.disabled !== 'boolean')
    || invitations.some(invite => typeof invite.revoked !== 'boolean' || !Number.isFinite(invite.expiresAt))) {
    throw new Error('Invalid service response. Please try again.');
  }
  return { users, invitations, mailConfigured: data.mailConfigured };
}
