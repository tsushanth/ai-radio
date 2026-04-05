'use client';

import type { LiveStation } from '@/lib/api/episodes';

interface LiveStationCardProps {
  station: LiveStation;
  isPlaying?: boolean;
  onTap: () => void;
}

export function LiveStationCard({ station, isPlaying, onTap }: LiveStationCardProps) {
  return (
    <button
      onClick={onTap}
      className="flex-shrink-0 w-44 group"
    >
      {/* Station visual */}
      <div
        className={`relative w-full h-36 rounded-2xl flex flex-col items-center justify-center overflow-hidden transition-all group-hover:scale-105 ${
          isPlaying ? 'ring-2 ring-white ring-offset-2 ring-offset-red-500 shadow-lg shadow-red-500/30' : ''
        }`}
        style={{ backgroundColor: station.color || '#EF4444' }}
      >
        {/* Flag emoji */}
        <span className="text-5xl mb-1">{station.icon}</span>
        <span className="text-white/90 text-xs font-medium mt-1">{station.language.toUpperCase()}</span>

        {/* Live badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-red-600 rounded-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-xs font-bold text-white">LIVE</span>
        </div>

        {/* Playing indicator */}
        {isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5">
            <span className="w-1 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
            <span className="w-1 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
            <span className="w-1 h-5 bg-white rounded-full animate-pulse" style={{ animationDelay: '100ms' }}></span>
          </div>
        )}
      </div>

      {/* Station info */}
      <div className="mt-2">
        <h3 className="font-semibold text-sm text-gray-900 truncate">
          {station.icon} {station.name}
        </h3>
        <p className="text-xs text-gray-500 truncate">
          {station.description}
        </p>
      </div>
    </button>
  );
}
