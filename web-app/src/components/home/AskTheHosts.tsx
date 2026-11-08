'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Mic, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { PODCAST_LANGUAGES, podcastLanguageFor } from '@/lib/topic-language';
import {
  ASK_HISTORY_KEY, ASK_MAX_CHARS, askBlockedReason, fetchAskConfig, formatDuration, getInstallId, recentAsks, stageLabel, submitAsk,
  validateAskText, waitForAsk, type AskConfigView, type AskEpisodeView,
} from '@/lib/ask';

function readHistory(): unknown {
  try {
    return JSON.parse(localStorage.getItem(ASK_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Discover-tab card: "Ask the hosts". Type an event or question, pick a language, and two AI hosts discuss what the latest
 * headlines say. Renders nothing until the backend reports the feature is on.
 */
export function AskTheHosts() {
  const { preferences } = useAuth();
  const [config, setConfig] = useState<AskConfigView | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskEpisodeView | null>(null);
  const abort = useRef({ aborted: false });

  useEffect(() => {
    let live = true;
    fetchAskConfig().then((c) => { if (live) setConfig(c); });
    return () => { live = false; abort.current.aborted = true; };
  }, []);

  useEffect(() => {
    if (config) setLanguage(config.languages.includes(podcastLanguageFor(preferences.language)) ? podcastLanguageFor(preferences.language) : 'en');
  }, [config, preferences.language]);

  if (!config) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setResult(null);
    const checked = validateAskText(text, config?.minChars);
    if (!checked.ok) return setError(checked.error);
    const now = Date.now();
    const blocked = askBlockedReason(readHistory(), now);
    if (blocked) return setError(blocked);

    abort.current = { aborted: false };
    setBusy(true);
    setStage('Sending your request...');
    setProgress(2);
    try {
      const { id } = await submitAsk({ text: checked.text, language, installId: getInstallId(localStorage) });
      localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify([...recentAsks(readHistory(), now), now]));
      const done = await waitForAsk(id, {
        signal: abort.current,
        onProgress: (p, status) => { setProgress(p); setStage(stageLabel(status.status)); },
      });
      if (done) setResult(done);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 p-4 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-left transition-colors"
      >
        <Mic className="w-5 h-5 text-purple-600 flex-shrink-0" />
        <span>
          <span className="block font-semibold text-sm">Ask the hosts</span>
          <span className="block text-xs text-gray-600">Tonight&apos;s game, a launch, a news story: two AI hosts discuss it</span>
        </span>
      </button>
    );
  }

  const languages = PODCAST_LANGUAGES.filter((l) => config.languages.includes(l.code));

  return (
    <form onSubmit={onSubmit} className="p-4 border border-purple-200 bg-white rounded-xl space-y-3">
      <div>
        <h3 className="font-semibold">Ask the hosts</h3>
        <p className="text-xs text-gray-600">
          Describe an event or news story. The hosts only talk about what recent headlines report, and tell you if there is not enough coverage.
          Episodes are AI-generated, take a minute or two, and have a link anyone can open.
        </p>
      </div>
      <div>
        <label htmlFor="ask-text" className="block text-sm font-medium mb-1">What should they talk about?</label>
        <textarea
          id="ask-text"
          value={text}
          maxLength={ASK_MAX_CHARS}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="e.g. Who won the Warriors game tonight?"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs text-gray-500 text-right">{text.length}/{ASK_MAX_CHARS}</p>
      </div>
      <div>
        <label htmlFor="ask-lang" className="block text-sm font-medium mb-1">Language</label>
        <select
          id="ask-lang"
          value={language}
          disabled={busy}
          onChange={(e) => setLanguage(e.target.value)}
          className="h-10 rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          {languages.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.name}</option>)}
        </select>
      </div>

      {busy && (
        <div role="status" aria-live="polite" className="space-y-1">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <p className="text-sm text-gray-700">{stage}</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {result && result.audioUrl && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="font-medium text-sm">{result.title}</p>
          <p className="text-xs text-gray-600">{result.description} {formatDuration(result.durationSeconds)}</p>
          <audio controls src={result.audioUrl} className="w-full" />
          <Link href={`/ask/${result.id}`} className="inline-flex items-center gap-1 text-sm text-purple-700 hover:underline">
            Sources and share link <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="bg-purple-600 hover:bg-purple-700">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {busy ? 'Working...' : 'Ask'}
        </Button>
        <Button type="button" variant="outline" onClick={() => { abort.current.aborted = true; setBusy(false); setOpen(false); }}>
          Close
        </Button>
      </div>
    </form>
  );
}
