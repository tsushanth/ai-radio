'use client';

import { Radio, Users } from 'lucide-react';
import type { LiveStation } from '@/lib/api/episodes';

interface LiveStationCardProps {
  station: LiveStation;
  onTap: () => void;
}

// Map icon names to appropriate display
function getStationIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    'radio': '📻',
    'newspaper': '📰',
    'globe': '🌍',
    'cpu': '💻',
    'briefcase': '💼',
    'trophy': '🏆',
    'film': '🎬',
  };
  return iconMap[icon] || '📻';
}

export function LiveStationCard({ station, onTap }: LiveStationCardProps) {
  return (
    <button
      onClick={onTap}
      className="flex-shrink-0 w-40 group"
    >
      {/* Station visual */}
      <div
        className="relative w-full h-28 rounded-xl flex items-center justify-center overflow-hidden transition-transform group-hover:scale-105"
        style={{ backgroundColor: station.color || '#EF4444' }}
      >
        {/* Icon */}
        <span className="text-4xl">{getStationIcon(station.icon)}</span>

        {/* Live badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-red-600 rounded-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
          <span className="text-xs font-bold text-white">LIVE</span>
        </div>

        {/* Listener count */}
        {station.listenerCount > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 bg-black/40 rounded-md">
            <Users className="w-3 h-3 text-white" />
            <span className="text-xs text-white">{station.listenerCount}</span>
          </div>
        )}
      </div>

      {/* Station info */}
      <div className="mt-2">
        <h3 className="font-semibold text-sm text-gray-900 truncate">
          {station.name}
        </h3>
        <p className="text-xs text-gray-500 truncate">
          {station.description || `Updates every ${station.refreshIntervalMinutes} min`}
        </p>
      </div>
    </button>
  );
}
