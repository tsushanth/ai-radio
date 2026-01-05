'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTopics } from '@/hooks/useTopics';
import { GradientHeader } from '@/components/home/GradientHeader';
import { CategoryRow } from '@/components/home/CategoryRow';
import { ScriptViewer } from '@/components/episodes/ScriptViewer';
import { generateEpisode, getJobStatus } from '@/lib/api/episodes';
import { DailyBriefStatus, Topic, Episode } from '@/types';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { user, isLinked, preferences, toggleBookmark, hideTopic } = useAuth();
  const { topics, categories, isLoading: topicsLoading } = useTopics();

  const [dailyBriefStatus, setDailyBriefStatus] = useState<DailyBriefStatus>('not_linked');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [dailyBriefEpisode, setDailyBriefEpisode] = useState<Episode | null>(null);
  const [showScriptViewer, setShowScriptViewer] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Update status based on linked accounts
  useEffect(() => {
    if (isLinked) {
      // Check if we have a cached episode for today
      const cachedEpisode = localStorage.getItem('audexa-daily-brief');
      if (cachedEpisode) {
        try {
          const parsed = JSON.parse(cachedEpisode);
          const episodeDate = new Date(parsed.createdAt).toDateString();
          const today = new Date().toDateString();
          if (episodeDate === today && parsed.audioUrl) {
            setDailyBriefEpisode(parsed);
            setDailyBriefStatus('completed');
            return;
          }
        } catch {
          localStorage.removeItem('audexa-daily-brief');
        }
      }
      setDailyBriefStatus('ready');
    } else {
      setDailyBriefStatus('not_linked');
    }
  }, [isLinked]);

  // Filter topics
  const visibleTopics = topics.filter((t) => !preferences.hiddenTopicIds.includes(t.id));
  const bookmarkedTopics = visibleTopics.filter((t) => preferences.bookmarkedTopicIds.includes(t.id));

  // Group topics by category
  const topicsByCategory = categories.reduce((acc, category) => {
    acc[category] = visibleTopics.filter((t) => t.category === category);
    return acc;
  }, {} as Record<string, Topic[]>);

  // Generate daily brief
  const handleGenerate = useCallback(async () => {
    if (!user?.email) return;

    setDailyBriefStatus('generating');
    setGenerationProgress(0);

    try {
      const { jobId } = await generateEpisode(user.email, {
        voiceHost1: preferences.voiceHost1,
        voiceHost2: preferences.voiceHost2,
        language: preferences.language,
        includeEmail: preferences.includeEmail,
        includeCalendar: preferences.includeCalendar,
      });

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const status = await getJobStatus(jobId);
          setGenerationProgress(status.progress || 0);

          if (status.status === 'completed' && status.episode) {
            clearInterval(pollInterval);
            setDailyBriefEpisode(status.episode);
            setDailyBriefStatus('completed');
            localStorage.setItem('audexa-daily-brief', JSON.stringify(status.episode));
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setDailyBriefStatus('error');
          }
        } catch {
          clearInterval(pollInterval);
          setDailyBriefStatus('error');
        }
      }, 2000);
    } catch (err) {
      console.error('Failed to generate:', err);
      setDailyBriefStatus('error');
    }
  }, [user?.email, preferences]);

  // Play/Pause daily brief
  const handlePlay = useCallback(() => {
    if (!dailyBriefEpisode?.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(dailyBriefEpisode.audioUrl);
      audioRef.current.onended = () => setDailyBriefStatus('completed');
    }

    audioRef.current.play();
    setDailyBriefStatus('playing');
  }, [dailyBriefEpisode?.audioUrl]);

  const handlePause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setDailyBriefStatus('completed');
  }, []);

  // Navigate to settings to connect account
  const handleConnectAccount = useCallback(() => {
    router.push('/settings');
  }, [router]);

  // Navigate to topic detail
  const handleTopicTap = useCallback((topic: Topic) => {
    router.push(`/topics/${topic.id}`);
  }, [router]);

  if (topicsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Daily Brief Header */}
      <div className="p-4">
        <GradientHeader
          status={dailyBriefStatus}
          progress={generationProgress}
          userName={user?.name}
          hasScript={!!dailyBriefEpisode?.script}
          onGenerate={handleGenerate}
          onPlay={handlePlay}
          onPause={handlePause}
          onConnectAccount={handleConnectAccount}
          onViewScript={() => setShowScriptViewer(true)}
        />
      </div>

      {/* Your Topics (Bookmarked) */}
      {bookmarkedTopics.length > 0 && (
        <CategoryRow
          title="Your Topics"
          topics={bookmarkedTopics}
          bookmarkedIds={preferences.bookmarkedTopicIds}
          onTopicTap={handleTopicTap}
          onBookmarkToggle={toggleBookmark}
          onHideTopic={hideTopic}
        />
      )}

      {/* Popular Topics */}
      <CategoryRow
        title="Popular Topics"
        topics={visibleTopics.slice(0, 10)}
        bookmarkedIds={preferences.bookmarkedTopicIds}
        onTopicTap={handleTopicTap}
        onBookmarkToggle={toggleBookmark}
        onHideTopic={hideTopic}
      />

      {/* All Categories */}
      {categories.map((category) => {
        const categoryTopics = topicsByCategory[category] || [];
        if (categoryTopics.length === 0) return null;
        return (
          <CategoryRow
            key={category}
            title={category}
            topics={categoryTopics}
            bookmarkedIds={preferences.bookmarkedTopicIds}
            onTopicTap={handleTopicTap}
            onBookmarkToggle={toggleBookmark}
            onHideTopic={hideTopic}
          />
        );
      })}

      {/* Script Viewer Modal */}
      <ScriptViewer
        isOpen={showScriptViewer}
        onClose={() => setShowScriptViewer(false)}
        script={dailyBriefEpisode?.script || null}
        title="Daily Brief Script"
      />
    </div>
  );
}
