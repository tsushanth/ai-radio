/**
 * A linked-account request without a session must show a provider access token that belongs to the account it is filed under.
 * The provider is asked whose token it is. LINK_ACCOUNT_PROOF=off disables the check.
 */
import type { NextFunction, Request, Response } from 'express';

export type TokenOwner = { kind: 'ok'; addresses: string[] } | { kind: 'rejected' } | { kind: 'unavailable' };
export type TokenOwnerLookup = (provider: 'google' | 'microsoft', accessToken: string) => Promise<TokenOwner>;

/** Each answers with the account's address when the token carries a scope it accepts (Gmail, profile or Calendar). */
const SOURCES: Record<'google' | 'microsoft', Array<{ url: string; read(body: any): unknown }>> = {
  google: [
    { url: 'https://gmail.googleapis.com/gmail/v1/users/me/profile', read: (b) => b?.emailAddress },
    { url: 'https://www.googleapis.com/oauth2/v3/userinfo', read: (b) => (b?.email_verified === false ? null : b?.email) },
    { url: 'https://www.googleapis.com/calendar/v3/calendars/primary', read: (b) => b?.id },
  ],
  // userPrincipalName only: its domain is verified by the directory, unlike the free-text mail attribute.
  microsoft: [{ url: 'https://graph.microsoft.com/v1.0/me', read: (b) => b?.userPrincipalName }],
};

export async function lookupTokenOwner(
  provider: 'google' | 'microsoft',
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<TokenOwner> {
  let unavailable = false;
  for (const source of SOURCES[provider]) {
    try {
      const res = await fetchFn(source.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const address = source.read(await res.json());
        if (typeof address === 'string' && address.includes('@')) return { kind: 'ok', addresses: [address] };
      } else if (res.status >= 500 || res.status === 429) {
        unavailable = true;
      }
    } catch {
      unavailable = true;
    }
  }
  return unavailable ? { kind: 'unavailable' } : { kind: 'rejected' };
}

/** googlemail.com and gmail.com name the same mailbox. */
const mailbox = (a: string) => a.trim().toLowerCase().replace(/@googlemail\.com$/, '@gmail.com');

let override: TokenOwnerLookup | null = null;
/** Test hook: use this lookup instead of the provider. Pass null to restore. */
export function setTokenOwnerLookupForTests(l: TokenOwnerLookup | null): void {
  override = l;
}

/** Runs after requireUser: a verified session passes; a token-less (legacy) request must pass the provider check. */
export async function requireAccountProof(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (res.locals.authUser || (process.env.LINK_ACCOUNT_PROOF ?? '').trim().toLowerCase() === 'off') {
    next();
    return;
  }
  const { provider, access_token: accessToken } = (req.body ?? {}) as Record<string, unknown>;
  if ((provider !== 'google' && provider !== 'microsoft') || typeof accessToken !== 'string' || !accessToken) {
    next(); // the handler's validation answers 400 and stores nothing
    return;
  }
  const owner = await (override ?? lookupTokenOwner)(provider, accessToken).catch((): TokenOwner => ({ kind: 'unavailable' }));
  if (owner.kind === 'unavailable') {
    console.warn(`[AccountProof] ${provider} could not be asked; request not stored`);
    res.status(503).json({ success: false, error: 'Could not verify the account. Please try again.' });
    return;
  }
  const target = mailbox(String(req.params.userId ?? ''));
  if (owner.kind !== 'ok' || !owner.addresses.some((a) => mailbox(a) === target)) {
    console.warn(`[AccountProof] ${provider} request refused (${owner.kind === 'ok' ? 'different account' : 'token not accepted'})`);
    res.status(403).json({ success: false, error: 'Forbidden' });
    return;
  }
  next();
}
