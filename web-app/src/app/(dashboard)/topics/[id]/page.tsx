'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTopics } from '@/hooks/useTopics';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { AudioPlayer } from '@/components/episodes/AudioPlayer';
import { Topic, Episode } from '@/types';
import { getTopicEpisode, generateTopicEpisode, getTopicEpisodes } from '@/lib/api/episodes';
import {
  ArrowLeft,
  Bookmark,
  Play,
  Loader2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Map icon names to emoji
function getTopicIcon(icon: string): string {
  const iconMap: Record<string, string> = {
    'newspaper': '📰',
    'globe': '🌍',
    'cpu': '💻',
    'briefcase': '💼',
    'flask': '🔬',
    'heart': '❤️',
    'football': '⚽',
    'film': '🎬',
    'landmark': '🏛️',
    'chart': '📊',
    'book': '📚',
    'music': '🎵',
    'gamepad': '🎮',
    'plane': '✈️',
    'utensils': '🍽️',
  };
  return iconMap[icon] || '🎙️';
}

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { topics } = useTopics();
  const { preferences, toggleBookmark } = useAuth();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [previousEpisodes, setPreviousEpisodes] = useState<Episode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  const topicId = params.id as string;
  const isBookmarked = preferences.bookmarkedTopicIds.includes(topicId);

  // Find topic from loaded topics
  useEffect(() => {
    const foundTopic = topics.find((t) => t.id === topicId);
    if (foundTopic) {
      setTopic(foundTopic);
    }
  }, [topics, topicId]);

  // Fetch existing episode and previous episodes for this topic
  useEffect(() => {
    async function fetchEpisodes() {
      try {
        setIsLoading(true);

        // Fetch current episode and previous episodes in parallel
        const [currentEpisode, episodes] = await Promise.all([
          getTopicEpisode(topicId),
          getTopicEpisodes(topicId, 7),
        ]);

        if (currentEpisode && currentEpisode.audioUrl) {
          setEpisode(currentEpisode);
        }

        // Filter out current episode from previous episodes
        const prevEps = episodes.filter(ep => ep.id !== currentEpisode?.id);
        setPreviousEpisodes(prevEps);
      } catch (err) {
        // No episode exists yet, that's ok
        console.log('No existing episode for topic:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (topicId) {
      fetchEpisodes();
    }
  }, [topicId]);

  // Generate episode - synchronous, returns episode directly
  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setShouldAutoPlay(false);

    try {
      // Topic generation is synchronous - waits for completion
      const generatedEpisode = await generateTopicEpisode(topicId);
      setEpisode(generatedEpisode);
      setShouldAutoPlay(true); // Auto-play newly generated episodes
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate episode');
    } finally {
      setIsGenerating(false);
    }
  }, [topicId]);

  if (!topic) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      {/* Header with gradient background */}
      <div
        className="relative p-6 pb-24"
        style={{ backgroundColor: topic.color || '#f97316' }}
      >
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-white/80 hover:text-white mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        {/* Topic info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{getTopicIcon(topic.icon)}</span>
            <div>
              <h1 className="text-2xl font-bold text-white">{topic.name}</h1>
              <p className="text-white/70 flex items-center gap-1 mt-1">
                <Clock className="w-4 h-4" />
                {topic.targetDurationMinutes || 5} min daily
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleBookmark(topicId)}
            className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <Bookmark
              className={`w-6 h-6 text-white ${isBookmarked ? 'fill-white' : ''}`}
            />
          </button>
        </div>

        {/* Description */}
        <p className="text-white/80 mt-4">{topic.description}</p>
      </div>

      {/* Content area - overlaps header */}
      <div className="relative -mt-16 px-6 pb-8">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : isGenerating ? (
            <div className="py-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
              <p className="font-semibold">Generating episode...</p>
              <p className="text-sm text-gray-500 mt-1">
                This may take a minute or two
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={handleGenerate} className="bg-orange-500 hover:bg-orange-600">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : episode?.audioUrl ? (
            <div>
              <h2 className="text-lg font-semibold mb-4">Today&apos;s Episode</h2>
              <AudioPlayer src={episode.audioUrl} title={episode.title} autoPlay={shouldAutoPlay} />
              <div className="mt-4 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate New Episode
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-orange-500 ml-1" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No episode yet</h3>
              <p className="text-gray-500 mb-4">
                Generate your first episode on {topic.name}
              </p>
              <Button
                onClick={handleGenerate}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Play className="w-4 h-4 mr-2" />
                Generate Episode
              </Button>
            </div>
          )}
        </div>

        {/* Previous Episodes */}
        {previousEpisodes.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl shadow-lg p-6">
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="flex items-center justify-between w-full"
            >
              <h2 className="text-lg font-semibold">Previous Episodes</h2>
              {showPrevious ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>

            {showPrevious && (
              <div className="mt-4 space-y-3">
                {previousEpisodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="p-4 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{ep.title}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(ep.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {ep.audioUrl && (
                      <AudioPlayer src={ep.audioUrl} title={ep.title} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
