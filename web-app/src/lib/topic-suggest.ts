// "Suggest a topic": POST /api/topics/suggest { topicName, language, description? } (ai-radio-backend/src/routes/topics.ts).
// Same body Android sends (SuggestTopicRequest). No user id or email is sent. The backend stores the request and, when its
// topic-suggest job is switched on, reviews it and adds the topics that pass. The limits below keep one browser from flooding it.
// They are client-side courtesy limits; the backend also caps suggestions per IP per day.
import { apiClient } from './api/client.ts';

/** A two-letter lowercase language code, English otherwise. */
const safeLang = (v: unknown): string => (typeof v === 'string' && /^[a-z]{2}$/.test(v) ? v : 'en');

export const MAX_TOPIC_NAME = 80;
export const MAX_DESCRIPTION = 300;
/** At most this many suggestions per rolling 24 hours per browser, and this long between two. */
export const MAX_PER_DAY = 5;
export const MIN_GAP_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SUGGEST_HISTORY_KEY = 'audexa-suggest-history';

export interface SuggestionInput {
  topicName: string;
  description?: string;
  language?: string;
}

export type Validated =
  | { ok: true; body: { topicName: string; language: string; description?: string } }
  | { ok: false; error: string };

export function validateSuggestion(input: SuggestionInput): Validated {
  const topicName = (input.topicName ?? '').replace(/\s+/g, ' ').trim();
  const description = (input.description ?? '').trim();
  if (topicName.length < 3) return { ok: false, error: 'Please enter a topic name (at least 3 characters).' };
  if (topicName.length > MAX_TOPIC_NAME) return { ok: false, error: `Topic name must be ${MAX_TOPIC_NAME} characters or fewer.` };
  if (description.length > MAX_DESCRIPTION) return { ok: false, error: `Description must be ${MAX_DESCRIPTION} characters or fewer.` };
  const body: { topicName: string; language: string; description?: string } = { topicName, language: safeLang(input.language) };
  if (description) body.description = description;
  return { ok: true, body };
}

/** Timestamps (ms) of this browser's recent suggestions, oldest first, within the last 24 h. Tolerates junk. */
export function recentSuggestions(history: unknown, now: number): number[] {
  if (!Array.isArray(history)) return [];
  return history.filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t <= now && now - t < DAY_MS).sort((a, b) => a - b);
}

/** Null when a new suggestion may be sent now, otherwise the sentence to show. */
export function suggestionBlockedReason(history: unknown, now: number): string | null {
  const recent = recentSuggestions(history, now);
  if (recent.length >= MAX_PER_DAY) return `You have sent ${MAX_PER_DAY} suggestions today. Please try again tomorrow.`;
  const last = recent[recent.length - 1];
  if (last !== undefined && now - last < MIN_GAP_MS) return 'Please wait a few seconds before sending another suggestion.';
  return null;
}

export interface SuggestResult {
  requestId?: string;
  status?: string;
}

/** Sends a validated suggestion. Throws (with the server's message) on any non-2xx or network failure. */
export async function submitSuggestion(body: { topicName: string; language: string; description?: string }): Promise<SuggestResult> {
  const res = await apiClient<{ success: boolean; data?: { requestId?: string; status?: string } }>('/topics/suggest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res && res.success === false) throw new Error('Failed to submit suggestion');
  return { requestId: res?.data?.requestId, status: res?.data?.status };
}
