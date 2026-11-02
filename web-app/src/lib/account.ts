// Account deletion, as the web app does it.
//
// The backend route is DELETE /api/user/:userId (ai-radio-backend/src/routes/user.ts). It removes the user's linked accounts
// (OAuth tokens), their daily-brief episodes and their profile row, and revokes any cached Google/Microsoft token. It does NOT
// touch topic episodes (those are shared by all users). Every browser that taps "Get Started" is the same shared identity,
// guest@audexa.app, so for that identity we must never send the delete: it would wipe data that belongs to every guest.
import { apiClient } from './api/client.ts';

/** The identity every "Get Started" visitor shares (see app/auth/page.tsx). */
export const GUEST_EMAIL = 'guest@audexa.app';

/** True for the shared guest identity, or when there is no usable id at all. Neither may ever be sent to the backend as a delete. */
export function isSharedIdentity(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  return e === '' || e === GUEST_EMAIL;
}

export interface DeleteAccountResult {
  /** True when the backend was asked to delete and said it did. False for the shared guest identity: only local data is cleared. */
  remoteDeleted: boolean;
}

/**
 * Deletes the signed-in user's server-side data. Throws (with the server's message) when the backend refuses or is unreachable,
 * so the caller must not clear local data or sign out on a throw.
 */
export async function deleteRemoteAccount(email: string | null | undefined): Promise<DeleteAccountResult> {
  if (isSharedIdentity(email)) return { remoteDeleted: false };
  await apiClient(`/user/${encodeURIComponent(email!.trim())}`, { method: 'DELETE' });
  return { remoteDeleted: true };
}

/** Everything this app keeps in the browser starts with this prefix (user, linked accounts, preferences, cached daily brief). */
export const LOCAL_KEY_PREFIX = 'audexa-';

/** Removes every key the app owns from a Storage, leaving other sites' and other apps' keys alone. Returns the keys it removed. */
export function clearAppStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(LOCAL_KEY_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => storage.removeItem(k));
  return keys;
}
