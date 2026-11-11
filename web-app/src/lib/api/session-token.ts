// The signed-in user's session token for the backend routes that act for one user (ai-radio-backend src/lib/user-auth.ts).
// The backend verifies a Supabase access token and requires its email to be the user in the request (URL or body), so the token is
// only ever sent for the user it belongs to: a leftover session of someone else (for example the admin page's) is not sent, and the
// shared guest identity never has one. Pure and injectable so it can be tested without a browser or the Supabase SDK.

export interface SessionSnapshot {
  email: string | null | undefined;
  accessToken: string | null | undefined;
}

/** Resolves the current session (refreshing it when it is about to expire), or null when nobody is signed in. */
export type SessionProvider = () => Promise<SessionSnapshot | null>;

let provider: SessionProvider | null = null;

/** Registered once by the browser-side AuthProvider; null removes it. */
export function setSessionProvider(p: SessionProvider | null): void {
  provider = p;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** The access token to send when acting as `userEmail`, or null (no session, another account's session, or no provider). */
export async function bearerTokenFor(userEmail: string | null | undefined): Promise<string | null> {
  const wanted = norm(userEmail);
  if (!wanted || !provider) return null;
  try {
    const session = await provider();
    const token = session?.accessToken?.trim();
    if (!token || norm(session?.email) !== wanted) return null;
    return token;
  } catch {
    return null;
  }
}
