/**
 * One episode in an additional language: sources -> script -> speech, with the controls around it.
 * Called by TopicPodcastGenerator for languages in the registry; returns what the generator needs to finish the episode
 * (concatenate, time, encode to MP3, upload, save). Nothing here writes to the database or storage.
 *
 * Order matters for spend: the key, the controls and the sources are checked BEFORE any model call; the script is checked (digits)
 * BEFORE any speech request; the character budget is checked BEFORE the first speech request. A failure before the first speech
 * request gives the episode slot back; after speech has started the slot stays counted.
 */
import type { AudioSegment } from '../../types/podcast';
import type { PodcastScript } from '../../types/database';
import type { AggregatedStory, TopicDefinition } from '../../types/topics';
import { reportFailure } from '../../lib/failureReporter';
import { requireLanguageSpec } from './registry';
import { languageControls, TtsBreakerTripped, type Denied, type LanguageControls } from './controls';
import { fetchLanguageStories, type LanguageStories, type SourceDeps } from './sources';
import { generateNewLanguageScript, type ScriptDeps } from './script';
import { ReadAloudClient, synthesizeScript, TtsUnavailableError } from './tts';

export class LanguageDeniedError extends Error {
  readonly code = 'language_denied';
  constructor(readonly denial: Denied) { super(denial.message); this.name = 'LanguageDeniedError'; }
}
export class NoSourcesError extends Error {
  readonly code = 'no_sources';
  constructor() { super('No content found for this topic. Please try again later.'); this.name = 'NoSourcesError'; }
}

export interface PipelineDeps {
  controls?: LanguageControls;
  /** Builds the speech client for an episode. Default: ReadAloud with the character counter and the 402 handler wired in. */
  makeClient?: (hooks: { onChars: (n: number) => Promise<void>; onOutOfCredits: () => Promise<void> }) => ReadAloudClient;
  sources?: SourceDeps;
  fetchStories?: typeof fetchLanguageStories;
  script?: ScriptDeps;
  log?: (m: string) => void;
}

export interface NewLanguageParts {
  stories: AggregatedStory[];
  sourceLanguage: LanguageStories['sourceLanguage'];
  script: PodcastScript;
  audioSegments: AudioSegment[];
  beta: boolean;
  /** Characters sent to the speech API for this episode (first attempts and retries). */
  ttsChars: number;
}

export async function buildNewLanguageEpisode(topic: TopicDefinition, language: string, date: string, deps: PipelineDeps = {}): Promise<NewLanguageParts> {
  const controls = deps.controls ?? languageControls;
  const log = deps.log ?? ((m: string) => console.log(m));
  const spec = requireLanguageSpec(language);
  let speechStarted = false;
  let ttsChars = 0;
  try {
    const adm = await controls.admitGeneration(language, topic.id);
    if (adm.ok !== true) throw new LanguageDeniedError(adm as Denied);

    const client = (deps.makeClient ?? ((h) => new ReadAloudClient({ onChars: h.onChars, onOutOfCredits: h.onOutOfCredits })))({
      onChars: async (n) => { await controls.reserveTtsChars(language, n); speechStarted = true; ttsChars += n; },
      onOutOfCredits: async () => {
        await controls.pauseForOutOfCredits();
        reportFailure('audexa_languages_tts_out_of_credits', new Error('ReadAloud API answered 402: new-language generation is paused'), { language });
      },
    });
    if (!client.isConfigured()) throw new TtsUnavailableError('no_key'); // before any model call

    log(`  [languages] ${language}: fetching sources for ${topic.id}`);
    const src = await (deps.fetchStories ?? fetchLanguageStories)(topic, spec, deps.sources);
    if (src.stories.length === 0) throw new NoSourcesError();

    const script = await generateNewLanguageScript(
      { topic, spec, stories: src.stories, sourceLanguage: src.sourceLanguage, date, displayName: topic.localizedNames?.[language] || topic.name },
      deps.script,
    );
    const total = script.segments.reduce((n, s) => n + s.text.length, 0);
    if (total > (await controls.ttsCharsRemaining())) throw new TtsBreakerTripped();

    const podcast: PodcastScript = {
      segments: script.segments, total_segments: script.segments.length,
      estimated_duration_seconds: Math.ceil((total / 6.5 / 150) * 60), generated_at: new Date().toISOString(),
    };
    const audioSegments = await synthesizeScript(podcast, { client, spec, flag: adm.flag, log });
    return { stories: src.stories, sourceLanguage: src.sourceLanguage, script: podcast, audioSegments, beta: adm.beta, ttsChars };
  } catch (e) {
    if (!speechStarted) await controls.releaseEpisode(language); // nothing was spent on speech: the slot goes back
    throw e;
  }
}

/**
 * Speaks an already written script again (the admin regenerate-audio endpoint). Same key, flag, breaker and character counting as a
 * new episode; takes no episode slot because the script, and so the model spend, already exist.
 */
export async function speakExistingScript(language: string, script: PodcastScript, deps: PipelineDeps = {}): Promise<AudioSegment[]> {
  const controls = deps.controls ?? languageControls;
  const log = deps.log ?? ((m: string) => console.log(m));
  const spec = requireLanguageSpec(language);
  const flag = await controls.enabledFlag(language);
  if (!flag) throw new LanguageDeniedError({ ok: false, http: 400, status: 'unavailable', error: 'language_unavailable', message: 'This language is not available yet.', reason: 'language_off' });
  const paused = await controls.pausedReason();
  if (paused) throw new TtsBreakerTripped();
  const client = (deps.makeClient ?? ((h) => new ReadAloudClient({ onChars: h.onChars, onOutOfCredits: h.onOutOfCredits })))({
    onChars: (n) => controls.reserveTtsChars(language, n),
    onOutOfCredits: () => controls.pauseForOutOfCredits(),
  });
  if (!client.isConfigured()) throw new TtsUnavailableError('no_key');
  return synthesizeScript(script, { client, spec, flag, log });
}
