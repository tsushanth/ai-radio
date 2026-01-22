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
  Sparkles,
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

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TopicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { topics } = useTopics();
  const { preferences, toggleBookmark } = useAuth();

  const [topic, setTopic] = useState<Topic | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
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

        // Fetch all episodes for the topic
        const episodes = await getTopicEpisodes(topicId, 10);

        if (episodes && episodes.length > 0) {
          // First episode is the current/latest one
          const latest = episodes[0];
          if (latest.audioUrl) {
            setCurrentEpisode(latest);
          }
          // Rest are previous episodes
          setPreviousEpisodes(episodes.slice(1));
        }
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
      // Move current episode to previous episodes before generating
      if (currentEpisode) {
        setPreviousEpisodes(prev => [currentEpisode, ...prev]);
      }

      // Topic generation is synchronous - waits for completion
      const generatedEpisode = await generateTopicEpisode(topicId);

      // Set the new episode as current
      setCurrentEpisode(generatedEpisode);
      setShouldAutoPlay(true); // Auto-play newly generated episodes
    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate episode');

      // Revert: move the episode back from previous if generation failed
      if (currentEpisode) {
        setPreviousEpisodes(prev => prev.filter(ep => ep.id !== currentEpisode.id));
      }
    } finally {
      setIsGenerating(false);
    }
  }, [topicId, currentEpisode]);

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
        {/* Generate New Episode Card */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-500" />
                Generate New Episode
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Create a fresh episode with the latest news
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate
                </>
              )}
            </Button>
          </div>

          {isGenerating && (
            <div className="mt-4 p-4 bg-orange-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Generating your episode...</p>
                  <p className="text-xs text-orange-600">This may take a minute or two</p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Current Episode Card */}
        {isLoading ? (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          </div>
        ) : currentEpisode?.audioUrl ? (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Latest Episode</h2>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {new Date(currentEpisode.createdAt).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{currentEpisode.title}</p>
            <AudioPlayer
              src={currentEpisode.audioUrl}
              title={currentEpisode.title}
              autoPlay={shouldAutoPlay}
            />
          </div>
        ) : !isGenerating && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-orange-500 ml-1" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No episode yet</h3>
              <p className="text-gray-500">
                Click &quot;Generate&quot; above to create your first episode on {topic.name}
              </p>
            </div>
          </div>
        )}

        {/* Previous Episodes */}
        {previousEpisodes.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl shadow-lg p-6">
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="flex items-center justify-between w-full"
            >
              <h2 className="text-lg font-semibold">
                Previous Episodes ({previousEpisodes.length})
              </h2>
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
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {ep.durationSeconds && (
                          <span>{formatDuration(ep.durationSeconds)}</span>
                        )}
                        <span>{new Date(ep.createdAt).toLocaleDateString()}</span>
                      </div>
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
