/**
 * How many proxy hops Express trusts when it reads the client address from X-Forwarded-For (req.ip, which the request limits key on).
 * On Fly the header ends "<client>, <this app's public address>", so the client is two from the end. Anything a caller puts in the
 * header itself comes before those two and is not read. Elsewhere there is one proxy.
 */
export const trustedProxyHops = (env: Record<string, string | undefined> = process.env): number => (env.FLY_APP_NAME ? 2 : 1);
