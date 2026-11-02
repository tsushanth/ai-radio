'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { buildShareText, buildShareUrl, shareOrCopy } from '@/lib/share';

/** "Share what's playing": system share sheet, or copy the link where there is none. */
export function ShareButton({
  stationName,
  language,
  topic,
  className = '',
  label = false,
}: {
  stationName: string;
  language: string;
  /** The topic the radio really reported, or null. Never guessed. */
  topic: string | null;
  className?: string;
  /** Show the word "Share" next to the icon. */
  label?: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  async function onClick() {
    const outcome = await shareOrCopy(typeof navigator === 'undefined' ? undefined : navigator, {
      title: stationName,
      text: buildShareText(stationName, topic),
      url: buildShareUrl(language),
    });
    const message = outcome === 'copied' ? 'Link copied' : outcome === 'failed' ? 'Could not share' : null;
    if (timer.current) window.clearTimeout(timer.current);
    setNote(message);
    if (message) timer.current = window.setTimeout(() => setNote(null), 2500);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        title="Share what's playing"
        aria-label={`Share ${stationName}`}
        className={className}
      >
        {note === 'Link copied' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        {label && <span className="ml-2">Share</span>}
      </button>
      <span role="status" aria-live="polite" className={note ? 'absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white' : 'sr-only'}>
        {note ?? ''}
      </span>
    </span>
  );
}
