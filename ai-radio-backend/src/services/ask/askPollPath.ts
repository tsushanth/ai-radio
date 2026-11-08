/**
 * True for an "Ask the hosts" status poll: GET /api/ask/<uuid>. The path is the one Express gives a middleware mounted at
 * /api (so it starts with /ask). Kept free of any config import so the global limiter and the tests can both use it.
 * These polls are limited by their own, higher cap inside the ask router instead of the shared /api limiter.
 */
const ASK_POLL_PATH = /^\/ask\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAskStatusPoll(method: string, path: string): boolean {
  return method === 'GET' && ASK_POLL_PATH.test(path);
}
