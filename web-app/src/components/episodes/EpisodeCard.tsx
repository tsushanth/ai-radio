'use client';

import Link from 'next/link';
import { Episode } from '@/types';
import { Play, Clock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface EpisodeCardProps {
  episode: Episode;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function EpisodeCard({ episode }: EpisodeCardProps) {
  const isReady = episode.status === 'completed';
  const isGenerating = episode.status === 'generating' || episode.status === 'pending';

  return (
    <Link
      href={isReady ? `/episodes/${episode.id}` : '#'}
      className={cn(
        'block bg-white rounded-lg border p-4 transition-all',
        isReady ? 'hover:shadow-md hover:border-orange-200 cursor-pointer' : 'opacity-75 cursor-default'
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
            isReady ? 'bg-orange-100' : 'bg-gray-100'
          )}
        >
          {isGenerating ? (
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          ) : (
            <Play className={cn('w-6 h-6', isReady ? 'text-orange-500' : 'text-gray-400')} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{episode.title}</h3>
          <p className="text-sm text-gray-500 truncate">{episode.description || 'Daily briefing'}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(episode.durationSeconds)}
            </span>
            <span>{formatDate(episode.createdAt)}</span>
            {isGenerating && (
              <span className="text-orange-500 font-medium">Generating...</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
