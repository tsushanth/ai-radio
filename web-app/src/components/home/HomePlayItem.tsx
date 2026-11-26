'use client';

// The one thing a signed-out visitor can play without leaving the home page: the live English station, one tap, no account.
// Most web visitors never pressed play because the public page had nothing to play.

import { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { playbackUrl } from '@/lib/api/stations';
import { listenStart, listenStop, track as trackEvent } from '@/lib/analytics';

type Status = 'idle' | 'loading' | 'playing' | 'error';
const SHOWN_KEY = 'audexa-home-play-shown';
const LANG = 'en';

const LINE: Record<Status, string> = {
  idle: 'AI news in English, live. No sign-up.',
  loading: 'Connecting...',
  playing: 'Playing live. Tap to pause.',
  error: 'The radio did not start. Tap to try again.',
};

export function HomePlayItem() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  /** One "started" per tap, not one per rebuffer. */
  const awaitingStart = useRef(false);

  // Seen: once per tab session, so views and taps can be compared.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SHOWN_KEY) === '1') return;
      sessionStorage.setItem(SHOWN_KEY, '1');
    } catch {
      /* no sessionStorage: count each mount */
    }
    trackEvent('home_play_shown', { item: 'radio' });
  }, []);

  useEffect(() => () => listenStop(), []);

  function stop() {
    const audio = audioRef.current;
    if (!audio) return;
    awaitingStart.current = false;
    audio.pause();
    audio.removeAttribute('src'); // drop the live connection instead of buffering it in the background
    audio.load();
    listenStop();
    setStatus('idle');
  }

  function fail() {
    awaitingStart.current = false;
    listenStop();
    setStatus('error');
    trackEvent('error_shown', { code: 'home_stream_error', source: 'stream' });
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === 'playing' || status === 'loading') return stop();
    trackEvent('home_play_tap', { item: 'radio' });
    awaitingStart.current = true;
    setStatus('loading');
    audio.src = playbackUrl(LANG);
    // play() must be called inside the tap, or mobile browsers refuse it
    audio.play().catch((err: unknown) => {
      if ((err as { name?: string } | null)?.name !== 'AbortError') fail();
    });
  }

  const busy = status === 'playing' || status === 'loading';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={busy ? 'Pause Audexa Radio' : 'Play Audexa Radio'}
      className="mx-auto mb-10 flex w-full max-w-md items-center gap-4 rounded-2xl border border-orange-500/40 bg-orange-500/10 p-4 text-left transition-colors hover:bg-orange-500/20"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
        {status === 'loading' ? (
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        ) : status === 'playing' ? (
          <Pause className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Play className="ml-1 h-6 w-6" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold">Play Audexa Radio now</span>
        <span className="block text-sm text-gray-300" role="status">
          {LINE[status]}
        </span>
      </span>
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => {
          setStatus('playing');
          listenStart({ source: 'radio', language: LANG });
          if (awaitingStart.current) {
            awaitingStart.current = false;
            trackEvent('home_play_started', { item: 'radio' });
          }
        }}
        onWaiting={() => {
          listenStop();
          setStatus((s) => (s === 'playing' ? 'loading' : s));
        }}
        onPause={() => {
          listenStop();
          // paused from outside (headset button, another tab taking audio): show the play button again
          setStatus((s) => (s === 'playing' ? 'idle' : s));
        }}
        onEnded={fail}
        onError={() => {
          if (audioRef.current?.getAttribute('src')) fail();
        }}
      />
    </button>
  );
}
