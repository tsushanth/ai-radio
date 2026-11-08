// "Ask the hosts": POST /api/ask { text, language, installId } then poll GET /api/ask/:id (ai-radio-backend/src/routes/ask.ts).
// The backend answers 404 ask_disabled until the feature is switched on, so the card hides itself when /ask/config is not there.
// The text is checked here only for length (courtesy); the backend does the real moderation and may still say no.
import { apiClient } from './api/client.ts';
import { isErrorCode } from './api/error-text.ts';
import { PollRetryLater, pollJob, type JobStatus, type PollOptions } from './job-poll.ts';
import { SITE } from './share.ts';

export const ASK_MIN_CHARS = 8;
export const ASK_MAX_CHARS = 200;
export const ASK_INSTALL_KEY = 'audexa-ask-install';
/** One browser may send this many per rolling day, this far apart (the backend enforces its own caps on top). */
export const ASK_MAX_PER_DAY = 3;
export const ASK_MIN_GAP_MS = 20_000;
export const ASK_HISTORY_KEY = 'audexa-ask-history';
const DAY_MS = 24 * 60 * 60 * 1000;

/** A two-letter lowercase language code, English otherwise. */
export const safeAskLang = (v: unknown): string => (typeof v === 'string' && /^[a-z]{2}$/.test(v) ? v : 'en');

/** Random id for this browser (8-64 of A-Z a-z 0-9 _ -). Not a login and not personal data: it only lets the backend count requests. */
export function makeInstallId(random: () => number = Math.random): string {
  let s = 'w';
  for (let i = 0; i < 24; i++) s += Math.floor(random() * 36).toString(36);
  return s;
}

interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function getInstallId(storage: KeyValueStore | undefined | null): string | undefined {
  if (!storage) return undefined;
  try {
    const have = storage.getItem(ASK_INSTALL_KEY);
    if (have && /^[A-Za-z0-9_-]{8,64}$/.test(have)) return have;
    const id = makeInstallId();
    storage.setItem(ASK_INSTALL_KEY, id);
    return id;
  } catch {
    return undefined;
  }
}

export type AskValidated = { ok: true; text: string } | { ok: false; error: string };

/** `minChars` is the server's minimum from /ask/config; ASK_MIN_CHARS is the fallback for a server that does not send it. */
export function validateAskText(raw: string, minChars: number = ASK_MIN_CHARS): AskValidated {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < minChars) return { ok: false, error: `Please describe the event or question in at least ${minChars} characters.` };
  if (text.length > ASK_MAX_CHARS) return { ok: false, error: `Please keep it to ${ASK_MAX_CHARS} characters or fewer.` };
  return { ok: true, text };
}

/** Timestamps (ms) of this browser's requests within the last 24 h, oldest first. Tolerates junk. */
export function recentAsks(history: unknown, now: number): number[] {
  if (!Array.isArray(history)) return [];
  return history.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t <= now && now - t < DAY_MS).sort((a, b) => a - b);
}

/** Null when a new request may be sent now, otherwise the sentence to show. */
export function askBlockedReason(history: unknown, now: number): string | null {
  const recent = recentAsks(history, now);
  if (recent.length >= ASK_MAX_PER_DAY) return `You have asked ${ASK_MAX_PER_DAY} times today. Please try again tomorrow.`;
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < ASK_MIN_GAP_MS) return 'Please wait a few seconds before asking again.';
  return null;
}

export interface AskSourceView { title: string; publisher: string; url: string; publishedAt: string | null }

export interface AskEpisodeView {
  id: string;
  status: string;
  progress: number;
  language: string;
  title: string | null;
  description: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  sources: AskSourceView[];
  reason: string | null;
  message: string | null;
  createdAt: string;
}

export interface AskConfigView { languages: string[]; maxChars: number; minChars: number }

/** The server's settings, or null when the feature is off (404) or the server cannot be reached: the card then stays hidden. */
export async function fetchAskConfig(): Promise<AskConfigView | null> {
  try {
    const res = await apiClient<{ success: boolean; data?: { enabled?: boolean; languages?: string[]; maxChars?: number; minChars?: number } }>('/ask/config');
    if (!res?.data?.enabled || !Array.isArray(res.data.languages)) return null;
    return {
      languages: res.data.languages.filter((l) => /^[a-z]{2}$/.test(l)),
      maxChars: res.data.maxChars ?? ASK_MAX_CHARS,
      minChars: typeof res.data.minChars === 'number' && res.data.minChars > 0 ? res.data.minChars : ASK_MIN_CHARS,
    };
  } catch {
    return null;
  }
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const BUSY_ERROR = 'Lots of people are using this right now. Please wait a moment and try again.';
const OFFLINE_ERROR = 'Could not reach the server. Please check your connection and try again.';

/** An Error whose `message` is safe to show, plus what the poller needs to know about it. */
export class AskError extends Error {
  status?: number;
  retryAfterMs?: number;
}

/**
 * The sentence to show for a failed Ask call. The server's own `message` when it sent one (Ask routes answer
 * `{ error: '<code>', message: '<sentence>' }`); otherwise a plain sentence, never a bare code such as "advice" or "busy".
 */
export function askErrorText(err: unknown): string {
  const e = err as { status?: number; body?: { message?: unknown }; message?: unknown } | null;
  const fromBody = e?.body?.message;
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody;
  if (e?.status === 404) return 'Episode not found.';
  if (e?.status === 429) return BUSY_ERROR;
  if (e?.status === undefined && err instanceof TypeError) return OFFLINE_ERROR;
  // Messages we wrote ourselves ("Could not start the episode") are fine; codes and "API error: 500" are not.
  if (e?.status === undefined && typeof e?.message === 'string' && e.message && !isErrorCode(e.message)) return e.message;
  return GENERIC_ERROR;
}

function toAskError(err: unknown): AskError {
  const e = err as { status?: number; retryAfterMs?: number } | null;
  const out = new AskError(askErrorText(err));
  out.status = e?.status;
  out.retryAfterMs = e?.retryAfterMs;
  return out;
}

/** Starts a request. Throws an Error carrying the server's plain-language message. */
export async function submitAsk(body: { text: string; language: string; installId?: string }): Promise<{ id: string }> {
  let res;
  try {
    res = await apiClient<{ success: boolean; data?: { id?: string } }>('/ask', { method: 'POST', body: JSON.stringify(body) });
  } catch (err) {
    throw toAskError(err);
  }
  if (!res?.data?.id) throw new Error('Could not start the episode');
  return { id: res.data.id };
}

export async function fetchAsk(id: string): Promise<AskEpisodeView> {
  let res;
  try {
    res = await apiClient<{ success: boolean; data?: AskEpisodeView }>(`/ask/${encodeURIComponent(id)}`);
  } catch (err) {
    throw toAskError(err);
  }
  if (!res?.data) throw new Error('Episode not found');
  return res.data;
}

const TERMINAL_NOT_OK = ['rejected', 'no_coverage', 'failed'];

/** Maps the ask status onto the shared poller: finished => episode, rejected / no coverage / failed => a failure carrying the server's message. */
export function toJobStatus(v: AskEpisodeView): JobStatus<AskEpisodeView> {
  if (v.status === 'completed' && v.audioUrl) return { status: 'completed', progress: v.progress, episode: v };
  if (v.status === 'completed') return { status: 'failed', error: 'The episode finished without audio. Please try again.' };
  if (TERMINAL_NOT_OK.includes(v.status)) return { status: 'failed', error: v.message || 'The hosts could not make this episode.' };
  return { status: v.status, progress: v.progress };
}

/** Wait before status call number `calls + 1`: 3 s, then 0.5 s longer each time, up to 8 s. About 65 calls in 8 minutes instead of 160. */
export const askPollDelayMs = (calls: number): number => Math.min(8000, 3000 + Math.max(0, calls - 1) * 500);

const RATE_LIMIT_WAIT_MS = { min: 5_000, max: 60_000, fallback: 15_000 };

export function waitForAsk(id: string, opts: PollOptions<AskEpisodeView> = {}, get: (id: string) => Promise<AskEpisodeView> = fetchAsk) {
  return pollJob<AskEpisodeView>(async () => {
    try {
      return toJobStatus(await get(id));
    } catch (err) {
      // 429 from a status call: wait as long as the server says (within reason) and carry on, instead of failing the episode.
      const e = err as { status?: number; retryAfterMs?: number } | null;
      if (e?.status === 429) {
        const wait = e.retryAfterMs ?? RATE_LIMIT_WAIT_MS.fallback;
        throw new PollRetryLater(Math.min(RATE_LIMIT_WAIT_MS.max, Math.max(RATE_LIMIT_WAIT_MS.min, wait)));
      }
      throw err;
    }
  }, { intervalMs: 3000, nextIntervalMs: askPollDelayMs, timeoutMs: 8 * 60_000, ...opts });
}

export function stageLabel(status: string): string {
  switch (status) {
    case 'queued': return 'Waiting for a free studio...';
    case 'reviewing': return 'Checking your request...';
    case 'searching': return 'Reading the latest headlines...';
    case 'writing': return 'The hosts are preparing...';
    case 'recording': return 'Recording the episode...';
    case 'completed': return 'Ready';
    default: return 'Working...';
  }
}

/** The public page and the link that gets shared. */
export function askEpisodeUrl(id: string): string {
  return `${SITE}/ask/${encodeURIComponent(id)}`;
}

export function askShareText(title: string | null): string {
  return title
    ? `Two AI hosts discuss: ${title}. It is an AI-generated episode based on recent headlines.`
    : 'Two AI hosts discuss a news story. It is an AI-generated episode based on recent headlines.';
}

/** "3:07" for a whole number of seconds. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Only https links go into an href. */
export function safeHref(url: string): string | null {
  return /^https:\/\//i.test(url) ? url : null;
}
