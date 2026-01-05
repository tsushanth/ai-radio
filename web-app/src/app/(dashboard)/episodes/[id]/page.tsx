'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Episode } from '@/types';
import { getEpisode, deleteEpisode } from '@/lib/api/episodes';
import { AudioPlayer } from '@/components/episodes/AudioPlayer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2, Loader2, Calendar, Clock } from 'lucide-react';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function EpisodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEpisode() {
      try {
        setIsLoading(true);
        const data = await getEpisode(params.id as string);
        setEpisode(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load episode');
      } finally {
        setIsLoading(false);
      }
    }

    if (params.id) {
      fetchEpisode();
    }
  }, [params.id]);

  const handleDelete = async () => {
    if (!episode || !confirm('Are you sure you want to delete this episode?')) return;

    try {
      setIsDeleting(true);
      await deleteEpisode(episode.id);
      router.push('/episodes');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete episode');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !episode) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="text-center py-20">
          <p className="text-red-500">{error || 'Episode not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          variant="ghost"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-red-500 hover:text-red-600 hover:bg-red-50"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Episode Info */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{episode.title}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDate(episode.createdAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDuration(episode.durationSeconds)}
          </span>
        </div>
        {episode.description && (
          <p className="text-gray-600 mt-4">{episode.description}</p>
        )}
      </div>

      {/* Audio Player */}
      {episode.audioUrl ? (
        <AudioPlayer src={episode.audioUrl} title={episode.title} />
      ) : (
        <div className="bg-gray-100 rounded-xl p-8 text-center">
          <p className="text-gray-500">Audio not available</p>
        </div>
      )}
    </div>
  );
}
