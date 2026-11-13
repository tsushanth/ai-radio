/**
 * Prompt guardrails for scripts grounded in web text (Exa articles, Reddit archive posts and replies). Applied only when at least one
 * story carries an `excerpt`; scripts built from RSS/HN headlines alone keep the unchanged prompt.
 */
import type { AggregatedStory } from '../../types/topics';

export const SOURCE_HANDLING_RULES = `SOURCE HANDLING (some stories below carry excerpts of web articles or community posts):
- Paraphrase everything in your own words. Never copy sentences from an excerpt.
- Name the outlet on air for each story that comes from an article, for example "according to CNBC" or "TechCrunch reports". For a story labelled "discussion on r/<name>", say it came from a discussion on that subreddit.
- Quote at most a short phrase (under 10 words), and only with its attribution.
- Never mention usernames, handles, author names or personal details of private individuals (names, ages, employers, addresses, contact details). Describe people generically ("one poster", "a reader").
- Do not read out URLs or email addresses.
- State only what the excerpts and headlines support. Do not invent facts, numbers or quotes.`;

export const EXCERPT_PROMPT_CHARS = 600;

export function hasGroundedExcerpts(stories: readonly AggregatedStory[]): boolean {
  return stories.some(s => !!s.excerpt);
}

/** One line per story for the user prompt. Stories without an excerpt keep the original format exactly. */
export function formatStoryLine(s: AggregatedStory, index: number): string {
  const base = `${index + 1}. ${s.title}${s.summary ? ` - ${s.summary.substring(0, 150)}` : ''} (${s.source})`;
  if (!s.excerpt) return base;
  return `${index + 1}. ${s.title} (${s.source})\n   Excerpt: ${s.excerpt.substring(0, EXCERPT_PROMPT_CHARS)}`;
}

/** Excerpts only ground the prompt; they are not stored on the episode or returned to apps. */
export function stripExcerpts(stories: readonly AggregatedStory[]): AggregatedStory[] {
  return stories.map(({ excerpt: _excerpt, ...rest }) => rest);
}
