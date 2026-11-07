'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Radio, Share2 } from 'lucide-react';
import { shareOrCopy, playStoreUrl, readUtm } from '@/lib/share';
import { askEpisodeUrl, askShareText, fetchAsk, formatDuration, safeHref, stageLabel, waitForAsk, type AskEpisodeView } from '@/lib/ask';

/** Public page body for a shared "Ask the hosts" episode: waits while it is still being made, then plays it and lists the headlines it used. */
export function AskPlayer({ id }: { id: string }) {
  const [episode, setEpisode] = useState<AskEpisodeView | null>(null);
  const [stage, setStage] = useState('Loading...');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const signal = { aborted: false };
    (async () => {
      try {
        // fetchAsk once so a missing id is reported as such rather than as a timeout
        const first = await fetchAsk(id);
        if (first.status === 'completed') return setEpisode(first);
        const done = await waitForAsk(id, { signal, onProgress: (_p, s) => setStage(stageLabel(s.status)) });
        if (done) setEpisode(done);
      } catch (err) {
        if (!signal.aborted) setError(err instanceof Error && err.message ? err.message : 'This episode could not be loaded.');
      }
    })();
    return () => { signal.aborted = true; };
  }, [id]);

  async function onShare() {
    const outcome = await shareOrCopy(typeof navigator === 'undefined' ? undefined : navigator, {
      title: episode?.title ?? 'Ask the hosts on Audexa',
      text: askShareText(episode?.title ?? null),
      url: askEpisodeUrl(id),
    });
    setNote(outcome === 'copied' ? 'Link copied' : outcome === 'failed' ? 'Could not share' : null);
    window.setTimeout(() => setNote(null), 2500);
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white px-4 py-10">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-2 text-orange-400">
          <Radio className="w-5 h-5" />
          <span className="font-semibold">Audexa</span>
        </div>

        {error && <p role="alert" className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-200">{error}</p>}

        {!episode && !error && (
          <p role="status" className="flex items-center gap-2 text-gray-300"><Loader2 className="w-4 h-4 animate-spin" /> {stage}</p>
        )}

        {episode && (
          <>
            <div>
              <h1 className="text-2xl font-bold">{episode.title}</h1>
              <p className="text-gray-400 mt-1">{episode.description}</p>
              <p className="text-xs text-gray-500 mt-2">
                AI-generated discussion between two AI hosts, based on recent news headlines. {formatDuration(episode.durationSeconds)}
              </p>
            </div>
            {episode.audioUrl && <audio controls src={episode.audioUrl} className="w-full" />}
            <button type="button" onClick={onShare} className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm">
              {note === 'Link copied' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} {note ?? 'Share'}
            </button>

            <section>
              <h2 className="font-semibold mb-2">Headlines this episode is based on</h2>
              <ul className="space-y-2 text-sm">
                {episode.sources.map((s, i) => {
                  const href = safeHref(s.url);
                  return (
                    <li key={i} className="text-gray-300">
                      {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-300 hover:underline">{s.title}</a> : s.title}
                      {s.publisher ? <span className="text-gray-500"> {'—'} {s.publisher}</span> : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-gray-500 mt-3">The hosts only discuss what these headlines report. Check the sources for the full stories.</p>
            </section>

            <a
              href={playStoreUrl(readUtm({ utm_source: 'web_ask', utm_medium: 'share', utm_campaign: 'ask_hosts' }))}
              className="inline-block text-sm text-orange-300 hover:underline"
            >
              Get the Audexa Android app
            </a>
          </>
        )}
      </div>
    </main>
  );
}
