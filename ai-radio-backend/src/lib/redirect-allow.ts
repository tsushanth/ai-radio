/**
 * Where the browser sign-in flow may send the user afterwards: pages of our own web app only.
 * OAUTH_REDIRECT_ORIGINS (comma list of origins) adds more; localhost is accepted outside production.
 */
export const WEB_APP_ORIGINS: readonly string[] = [
  'https://audexa.app',
  'https://www.audexa.app',
  'https://audexa-web.fly.dev',
  'https://audexa-web-3t2vweivqa-uc.a.run.app',
];

/**
 * undefined = none was asked for; null = not accepted; otherwise the normalized origin and path (what the redirect must use, so the
 * checked address and the followed one cannot differ).
 */
export function checkedRedirectUrl(raw: unknown, env: Record<string, string | undefined> = process.env): string | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const extra = (env.OAUTH_REDIRECT_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = new Set([...WEB_APP_ORIGINS, ...extra, ...(env.NODE_ENV === 'production' ? [] : ['http://localhost:3000'])]);
  return allowed.has(url.origin) ? url.origin + url.pathname : null;
}
