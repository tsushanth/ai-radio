'use client';

import { useState } from 'react';
import { Lightbulb, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  MAX_DESCRIPTION, MAX_TOPIC_NAME, SUGGEST_HISTORY_KEY, recentSuggestions, submitSuggestion, suggestionBlockedReason, validateSuggestion,
} from '@/lib/topic-suggest';

function readHistory(): unknown {
  try {
    return JSON.parse(localStorage.getItem(SUGGEST_HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Discover-tab card: "Suggest a topic" form (same request Android sends). */
export function SuggestTopic() {
  const { preferences } = useAuth();
  const [open, setOpen] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const checked = validateSuggestion({ topicName, description, language: preferences.language });
    if (!checked.ok) return setError(checked.error);
    const now = Date.now();
    const blocked = suggestionBlockedReason(readHistory(), now);
    if (blocked) return setError(blocked);

    setBusy(true);
    try {
      await submitSuggestion(checked.body);
      localStorage.setItem(SUGGEST_HISTORY_KEY, JSON.stringify([...recentSuggestions(readHistory(), now), now]));
      setSent(true);
      setTopicName('');
      setDescription('');
    } catch (err) {
      setError(`${err instanceof Error && err.message ? err.message : 'Something went wrong'}. Your suggestion was not sent.`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setSent(false); }}
        className="w-full flex items-center gap-3 p-4 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-xl text-left transition-colors"
      >
        <Lightbulb className="w-5 h-5 text-orange-500 flex-shrink-0" />
        <span>
          <span className="block font-semibold text-sm">Suggest a topic</span>
          <span className="block text-xs text-gray-600">Tell us what you would like to listen to</span>
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="p-4 border border-orange-200 bg-white rounded-xl space-y-3">
      <div>
        <h3 className="font-semibold">Suggest a topic</h3>
        <p className="text-xs text-gray-600">Tell us what you would like to listen to and we will consider adding it.</p>
      </div>
      {sent ? (
        <p role="status" className="flex items-center gap-2 text-sm text-green-700">
          <Check className="w-4 h-4" /> Thanks! Your suggestion was sent.
        </p>
      ) : null}
      <div>
        <label htmlFor="suggest-name" className="block text-sm font-medium mb-1">Topic name</label>
        <input
          id="suggest-name"
          value={topicName}
          maxLength={MAX_TOPIC_NAME}
          onChange={(e) => setTopicName(e.target.value)}
          placeholder="e.g. Quantum Computing"
          className="w-full h-10 rounded-md border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      <div>
        <label htmlFor="suggest-desc" className="block text-sm font-medium mb-1">Description (optional)</label>
        <textarea
          id="suggest-desc"
          value={description}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="bg-orange-500 hover:bg-orange-600">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {busy ? 'Sending...' : 'Send suggestion'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}
