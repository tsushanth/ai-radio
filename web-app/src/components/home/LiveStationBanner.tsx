'use client';

import { Pause, Play } from 'lucide-react';
import type { LiveStation } from '@/lib/api/episodes';

interface Props {
  station: LiveStation;
  isPlaying?: boolean;
  onTap: () => void;
}

/** One station, full width: the layout Android uses when a single station is on air. */
export function LiveStationBanner({ station, isPlaying, onTap }: Props) {
  return (
    <button
      onClick={onTap}
      aria-label={`${isPlaying ? 'Pause' : 'Play'} ${station.name}`}
      className="flex w-full items-center gap-4 rounded-xl bg-[#1A0A0A] px-4 py-3.5 text-left transition hover:bg-[#240D0D]"
    >
      <span className="text-3xl" aria-hidden="true">{station.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">{station.name}</span>
        <span className="block text-sm text-red-400">AI-powered 24/7 news, live</span>
      </span>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white">
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </span>
    </button>
  );
}
