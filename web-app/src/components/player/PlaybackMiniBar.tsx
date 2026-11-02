'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pause, Play, X } from 'lucide-react';
import { usePlayback } from './PlaybackProvider';

function useBarVisible(): boolean {
  const pathname = usePathname();
  const { track } = usePlayback();
  return !!track && pathname !== '/episodes';
}

/** Keeps page content from sitting under the fixed bar. */
export function PlaybackBarSpacer() {
  return useBarVisible() ? <div className="h-14 flex-shrink-0" aria-hidden="true" /> : null;
}

/**
 * Small persistent bar at the bottom of every dashboard page while the station or the daily brief is playing.
 * Hidden on Home (/episodes), which has its own full player with queue, chat and reactions.
 */
export function PlaybackMiniBar() {
  const visible = useBarVisible();
  const { track, playing, error, toggle, stop } = usePlayback();
  if (!visible || !track) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:left-64 bg-gray-900 text-white shadow-2xl" role="region" aria-label="Now playing">
      <div className="max-w-2xl mx-auto flex items-center gap-3 px-3 py-2">
        <span className="text-xl" aria-hidden="true">{track.icon ?? (track.kind === 'station' ? '\u{1F4FB}' : '\u{1F3A7}')}</span>
        <Link href="/episodes" className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{track.title}</span>
            {track.live && <span className="px-1.5 py-0.5 bg-red-500 rounded text-[10px] font-bold flex-shrink-0">LIVE</span>}
          </span>
          <span className="block text-xs text-white/60 truncate">{error ?? track.subtitle ?? ''}</span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
          className="w-9 h-9 rounded-full bg-white text-gray-900 flex items-center justify-center flex-shrink-0"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <button type="button" onClick={stop} aria-label="Stop playback" className="p-2 rounded-full hover:bg-white/20 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
