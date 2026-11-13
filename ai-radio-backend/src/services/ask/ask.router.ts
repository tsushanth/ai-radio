/**
 * HTTP side of "Ask the hosts". A factory so tests can mount it on a bare express app with fakes (no env, no network).
 *
 *   GET  /api/ask/config   -> { enabled, languages, maxChars, minChars }   (404 ask_disabled when the flag is off, so clients hide the feature)
 *   POST /api/ask          -> 202 { id, status }                 body { text, language?, installId? }
 *   GET  /api/ask/:id      -> the public view (status, progress, audio url, whole-second duration, sources, honest message)
 *
 * Every route answers 404 { error: 'ask_disabled' } unless ASK_HOSTS_ENABLED is on.
 */
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  AskConfig, AskDeps, AskState, AskStore, JobGate, MAX_REQUEST, MIN_REQUEST, checkAdmission, isStale, messageFor, runAskJob, toPublic, validateAskInput,
} from './ask';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Raw POSTs per IP per hour, before validation; and status polls per IP per 15 minutes. */
export const POST_VOLUME_PER_HOUR = 60;
export const POLL_PER_15_MIN = 600;

const INSTALL_RE = /^[A-Za-z0-9_-]{8,64}$/;

export interface AskRouterDeps {
  /** Read on every request so the flag and caps can change without a restart of the module (and tests can flip them). */
  config(): AskConfig;
  /** Built lazily: only called once the flag is on. */
  runtime(): { store: AskStore; deps: AskDeps; gate: JobGate; state: AskState; languages(): string[]; budgetCapped?(): Promise<boolean> };
  /** Test hook: how a started job is scheduled. Production: fire and forget. */
  schedule?(job: () => Promise<unknown>): void;
}

export function createAskRouter(d: AskRouterDeps): Router {
  const router = Router();

  const disabled = (_req: Request, res: Response, next: () => void) => {
    if (!d.config().enabled) {
      res.status(404).json({ success: false, error: 'ask_disabled' });
      return;
    }
    next();
  };
  router.use(disabled);

  // Per IP, 24 h window, in memory (per machine). The durable per-install and global caps are in checkAdmission.
  // It is applied inside the POST handler, after the input has passed validation: a refusal for too-short, advice or unsafe text
  // costs the person nothing. Accepted requests, and server failures after that point, count.
  const ipLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    limit: () => d.config().ipDailyLimit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: 'ip_limit', message: 'You have asked enough for today. Please try again tomorrow.' });
    },
  });

  // Abuse guard: raw POST volume per IP, valid or not, so spamming invalid input is still limited.
  const postVolumeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: POST_VOLUME_PER_HOUR,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: 'too_many_requests', message: 'Too many requests. Please wait a while and try again.' });
    },
  });

  // Status polls: the web page asks every few seconds for up to 8 minutes, so they get their own generous cap and are
  // exempt from the shared /api limiter (see middleware/rateLimiter.ts).
  const pollLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: POLL_PER_15_MIN,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: 'rate_limited', message: 'Too many status checks. Please wait a moment.' });
    },
  });

  /** Runs a limiter by hand. Resolves true when the request may go on, false when the limiter already answered 429. */
  const pass = (limiter: ReturnType<typeof rateLimit>, req: Request, res: Response) =>
    new Promise<boolean>((resolve, reject) => {
      res.once('close', () => resolve(false));
      limiter(req, res, (err?: unknown) => (err ? reject(err) : resolve(true)));
    });

  router.get('/config', (_req, res) => {
    res.json({ success: true, data: { enabled: true, languages: d.runtime().languages(), maxChars: MAX_REQUEST, minChars: MIN_REQUEST } });
  });

  router.post('/', postVolumeLimiter, async (req: Request, res: Response) => {
    try {
      const rt = d.runtime();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const input = validateAskInput(body.text, body.language, rt.languages());
      if (!input.ok) {
        res.status(400).json({ success: false, error: input.code, message: input.message });
        return;
      }
      if (!(await pass(ipLimiter, req, res))) return;
      const installId = typeof body.installId === 'string' && INSTALL_RE.test(body.installId) ? body.installId : null;

      if (rt.budgetCapped && (await rt.budgetCapped())) {
        // the persisted daily LLM budget (dollars / calls) is used up: same friendly answer as the daily request cap
        res.status(429).json({ success: false, error: 'daily_limit', message: 'Ask the hosts has reached its limit for today. Please try again tomorrow.' });
        return;
      }
      const now = rt.deps.now();
      const admission = await checkAdmission(rt.store, d.config(), rt.state, installId, now);
      if (!admission.ok) {
        res.status(admission.status).json({ success: false, error: admission.code, message: admission.message });
        return;
      }
      if (!rt.gate.reserve()) {
        res.status(429).set('Retry-After', '120').json({ success: false, error: 'busy', message: messageFor('studio_busy') });
        return;
      }
      let row;
      try {
        row = await rt.store.insert({ installId, requestText: input.text, language: input.language });
      } catch (e) {
        rt.gate.cancel();
        throw e;
      }
      const job = () => rt.gate.run(() => runAskJob(rt.deps, row.id));
      if (d.schedule) d.schedule(job); else void job().catch((e) => console.error('[ask] job error', e));

      res.status(202).json({ success: true, data: { id: row.id, status: row.status, pollAfterMs: 3000 } });
    } catch (e) {
      console.error('[ask] POST error:', e instanceof Error ? e.message : e);
      res.status(500).json({ success: false, error: 'server_error', message: messageFor('failed') });
    }
  });

  router.get('/:id', pollLimiter, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!UUID_RE.test(id)) {
        res.status(404).json({ success: false, error: 'not_found' });
        return;
      }
      const rt = d.runtime();
      let row = await rt.store.get(id);
      if (!row) {
        res.status(404).json({ success: false, error: 'not_found' });
        return;
      }
      // The machine restarted mid-job: fail the row so no client polls forever.
      if (isStale(row, rt.deps.now(), d.config().staleMs)) {
        await rt.store.update(id, { status: 'failed', reason: 'interrupted' });
        row = (await rt.store.get(id)) ?? row;
      }
      const pub = toPublic(row);
      res.set('Cache-Control', pub.status === 'completed' ? 'public, max-age=300' : 'no-store');
      res.json({ success: true, data: pub });
    } catch (e) {
      console.error('[ask] GET error:', e instanceof Error ? e.message : e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  });

  return router;
}
