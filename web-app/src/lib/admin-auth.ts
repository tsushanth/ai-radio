// Server-side admin authorization. Fail closed: anything unexpected denies.
// Pure + dependency-injected so it can be unit tested without Supabase.

export type AuthUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export type GetUser = (token: string) => Promise<AuthUser | null>;

export type AdminDecision =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 };

/** "A@x.com, b@y.com" -> ["a@x.com","b@y.com"]. Undefined/blank -> [] (deny everyone). */
export function parseAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.includes('@'));
}

export function isAdminUser(user: AuthUser | null | undefined, allowlist: string[]): boolean {
  if (!user || allowlist.length === 0) return false;
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  if (!email) return false;
  if (!user.email_confirmed_at && !user.confirmed_at) return false;
  return allowlist.includes(email);
}

export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

export async function authorizeAdmin(
  authorizationHeader: string | null | undefined,
  allowlistEnv: string | undefined | null,
  getUser: GetUser,
): Promise<AdminDecision> {
  const token = bearerToken(authorizationHeader);
  if (!token) return { ok: false, status: 401 };
  let user: AuthUser | null = null;
  try {
    user = await getUser(token);
  } catch {
    return { ok: false, status: 401 };
  }
  if (!user) return { ok: false, status: 401 }; // bad/expired token
  if (!isAdminUser(user, parseAllowlist(allowlistEnv))) return { ok: false, status: 403 };
  return { ok: true, email: String(user.email).toLowerCase() };
}
