/**
 * Minimal Exa Search client (https://exa.ai/docs/search/quickstart.md).
 *
 * Request shape, as in the quickstart's `lite` example: POST https://api.exa.ai/search, `Authorization: Bearer <key>`, JSON body
 * { query, type: "lite", numResults, startPublishedDate (ISO 8601), category?, contents: { highlights: true, text: { maxCharacters } } }.
 * `lite` rejects unsupported parameters with 400, so nothing else is sent: no summary, no maxAgeHours, no livecrawl, no outputSchema.
 *
 * The key comes from EXA_API_KEY at call time. It is only ever placed in the Authorization header: never in a URL, a log line or an
 * error message.
 */

export const EXA_SEARCH_URL = 'https://api.exa.ai/search';
export const EXA_TIMEOUT_MS = 15_000;
export const EXA_MAX_RETRY_AFTER_MS = 10_000;

export class ExaError extends Error {
  constructor(
    message: string,
    readonly kind: 'no_key' | 'auth' | 'credit' | 'rate_limited' | 'http' | 'network' | 'invalid',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ExaError';
  }
}

export interface ExaSearchParams {
  query: string;
  category?: 'news';
  numResults: number;
  /** Only pages published at or after this instant. */
  startPublishedDate: Date;
  /** Per-result cap for `contents.text`. */
  maxCharacters: number;
}

export interface ExaResult {
  id?: string;
  title?: string | null;
  url?: string;
  publishedDate?: string | null;
  author?: string | null;
  text?: string | null;
  highlights?: string[] | null;
}

export interface ExaSearchResponse {
  results: ExaResult[];
  costDollars?: { total?: number };
}

export interface ExaClientDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export function buildExaRequestBody(p: ExaSearchParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    query: p.query,
    type: 'lite',
    numResults: p.numResults,
    startPublishedDate: p.startPublishedDate.toISOString(),
  };
  if (p.category) body.category = p.category;
  body.contents = { highlights: true, text: { maxCharacters: p.maxCharacters } };
  return body;
}

/** Retry-After as milliseconds (seconds or an HTTP date); undefined when absent or unusable. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : undefined;
}

/**
 * One search. A 429 is retried once after Retry-After (capped at 10 s; no header = 1 s). A 429 that still fails, any other non-2xx
 * answer, a timeout (15 s) or an unparseable body throws ExaError; the caller treats every ExaError as "Exa failed, fall through".
 */
export async function exaSearch(params: ExaSearchParams, deps: ExaClientDeps = {}): Promise<ExaSearchResponse> {
  const env = deps.env ?? process.env;
  const key = env.EXA_API_KEY?.trim();
  if (!key) throw new ExaError('EXA_API_KEY is not set', 'no_key');
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const body = JSON.stringify(buildExaRequestBody(params));

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(EXA_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(EXA_TIMEOUT_MS),
      });
    } catch (e) {
      // Only the error class is reported: a fetch error message could echo request details.
      const name = e instanceof Error ? e.name : 'Error';
      throw new ExaError(`Exa request failed (${name})`, 'network');
    }

    if (res.status === 429) {
      if (attempt === 0) {
        const wait = parseRetryAfter(res.headers.get('retry-after'), Date.now()) ?? 1000;
        await sleep(Math.min(wait, EXA_MAX_RETRY_AFTER_MS));
        continue;
      }
      throw new ExaError('Exa rate limit (429)', 'rate_limited', 429);
    }
    if (res.status === 401 || res.status === 403) throw new ExaError(`Exa rejected the API key (${res.status})`, 'auth', res.status);
    if (res.status === 402) throw new ExaError('Exa credit exhausted (402)', 'credit', 402);
    if (!res.ok) throw new ExaError(`Exa error (${res.status})`, 'http', res.status);

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ExaError('Exa answered with a body that is not JSON', 'invalid', res.status);
    }
    const results = (json as { results?: unknown })?.results;
    if (!Array.isArray(results)) throw new ExaError('Exa answer has no results array', 'invalid', res.status);
    return { results: results as ExaResult[], costDollars: (json as ExaSearchResponse).costDollars };
  }
  throw new ExaError('Exa rate limit (429)', 'rate_limited', 429);
}
