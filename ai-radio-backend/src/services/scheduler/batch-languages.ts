/**
 * Which languages the daily batch generates for a topic. Universal topics ('all') are generated in English; a topic that belongs to
 * particular locales is generated in those. With Piper (TTS_BACKEND=piper) only English can be spoken, so locale-only topics are skipped
 * rather than failing every night.
 */
export function languagesForTopic(topicLanguages: readonly string[] | undefined, ttsBackend: string | undefined): string[] {
  const langs = topicLanguages?.includes('all') ? ['en'] : topicLanguages?.length ? [...topicLanguages] : ['en'];
  return ttsBackend === 'piper' ? langs.filter((l) => l === 'en') : langs;
}

/**
 * Whether the daily batch generates anything for a topic. This is THE skip rule: the batch scheduler uses it to skip a topic, and the
 * invariant sweep uses it to decide which topics must have a fresh episode, so the two cannot drift apart.
 */
export function isGeneratableTopic(topicLanguages: readonly string[] | undefined, ttsBackend: string | undefined): boolean {
  return languagesForTopic(topicLanguages, ttsBackend).length > 0;
}

/** Splits topics into those the batch generates and those it skips by design (e.g. non-English shows while Piper is English-only). */
export function partitionGeneratable<T extends { languages?: readonly string[] }>(
  topics: readonly T[],
  ttsBackend: string | undefined,
): { generatable: T[]; skippedByDesign: T[] } {
  const generatable: T[] = [];
  const skippedByDesign: T[] = [];
  for (const t of topics) (isGeneratableTopic(t.languages, ttsBackend) ? generatable : skippedByDesign).push(t);
  return { generatable, skippedByDesign };
}
