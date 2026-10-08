/**
 * Which languages the daily batch generates for a topic. Universal topics ('all') are generated in English; a topic that belongs to
 * particular locales is generated in those. With Piper (TTS_BACKEND=piper) only English can be spoken, so locale-only topics are skipped
 * rather than failing every night.
 */
export function languagesForTopic(topicLanguages: readonly string[] | undefined, ttsBackend: string | undefined): string[] {
  const langs = topicLanguages?.includes('all') ? ['en'] : topicLanguages?.length ? [...topicLanguages] : ['en'];
  return ttsBackend === 'piper' ? langs.filter((l) => l === 'en') : langs;
}
