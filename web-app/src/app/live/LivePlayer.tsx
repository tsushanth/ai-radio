'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Pause, Play, Radio, Smartphone } from 'lucide-react';
import { playbackUrl } from '@/lib/api/stations';
import { RADIO_STATUS_URL } from '@/lib/radio';
import { androidIntentUrl, playStoreUrl, topicFromStatus } from '@/lib/share';
import type { Utm } from '@/lib/share';

type Status = 'idle' | 'loading' | 'playing' | 'error';
const POLL_MS = 15_000;

export function LivePlayer({ lang, utm, initialTopic }: { lang: string; utm: Utm; initialTopic: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [topic, setTopic] = useState<string | null>(initialTopic);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(/Android/i.test(navigator.userAgent));
  }, []);

  // Keep "on air" fresh. The radio often does not report a topic; then the generic line stays.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${RADIO_STATUS_URL}?lang=${lang}`, { cache: 'no-store' });
        if (res.ok && !cancelled) setTopic(topicFromStatus(await res.json()));
      } catch {
        // keep what we have
      }
    }
    const timer = window.setInterval(load, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [lang]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === 'playing' || status === 'loading') {
      audio.pause();
      audio.removeAttribute('src'); // drop the live connection instead of buffering it in the background
      audio.load();
      setStatus('idle');
      return;
    }
    setStatus('loading');
    audio.src = playbackUrl(lang);
    try {
      await audio.play();
      setStatus('playing');
    } catch {
      setStatus('error');
    }
  }

  const playUrl = playStoreUrl(utm);
  const busy = status === 'loading';

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black px-4 py-10 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500">
            <Radio className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold">Audexa</span>
        </Link>

        <span className="rounded bg-red-500 px-2.5 py-1 text-xs font-bold">&#9679; LIVE</span>
        <h1 className="mt-4 text-2xl font-bold">Audexa Radio</h1>
        <p className="mt-1 text-sm text-white/60">AI-generated news and talk, streaming live</p>

        <button
          onClick={toggle}
          aria-label={status === 'playing' || busy ? 'Stop the live stream' : 'Play the live stream'}
          className="mt-8 flex h-20 w-20 items-center justify-center rounded-full bg-red-500 transition hover:bg-red-400"
        >
          {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : status === 'playing' ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
        </button>
        <p className="mt-3 min-h-5 text-sm text-white/70" aria-live="polite">
          {status === 'error'
            ? 'Could not start the stream. Tap play to try again.'
            : topic
              ? `On air: ${topic}`
              : status === 'playing'
                ? 'You are listening live.'
                : 'Tap play to listen live.'}
        </p>

        <div className="mt-10 flex w-full flex-col gap-3">
          {isAndroid && (
            <a
              href={androidIntentUrl(lang, utm)}
              className="flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-semibold hover:bg-orange-600"
            >
              <Smartphone className="h-5 w-5" /> Open in the app
            </a>
          )}
          <a
            href={playUrl}
            className="rounded-xl border border-white/20 px-4 py-3 font-semibold hover:bg-white/10"
          >
            Get it on Google Play
          </a>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live radio, nothing to caption */}
      <audio ref={audioRef} preload="none" onError={() => setStatus((s) => (s === 'idle' ? s : 'error'))} />
    </main>
  );
}
