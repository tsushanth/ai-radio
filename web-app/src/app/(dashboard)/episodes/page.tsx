'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTopics } from '@/hooks/useTopics';
import { GradientHeader } from '@/components/home/GradientHeader';
import { CategoryRow } from '@/components/home/CategoryRow';
import { TopicCard } from '@/components/home/TopicCard';
import { LiveStationCard } from '@/components/home/LiveStationCard';
import { ScriptViewer } from '@/components/episodes/ScriptViewer';
import { generateEpisode, getJobStatus, getLiveStations, getDeepDiveHistory, tuneIntoStation } from '@/lib/api/episodes';
import type { LiveStation, DeepDiveEpisode } from '@/lib/api/episodes';
import { DailyBriefStatus, Topic, Episode } from '@/types';
import { Loader2, Search, Radio, Sparkles, History, Bookmark, X } from 'lucide-react';

type TabType = 'forYou' | 'discover';

export default function HomePage() {
  const router = useRouter();
  const { user, isLinked, preferences, toggleBookmark, hideTopic } = useAuth();
  const { topics, categories, isLoading: topicsLoading } = useTopics();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('forYou');
  const [searchQuery, setSearchQuery] = useState('');

  // Daily Brief state
  const [dailyBriefStatus, setDailyBriefStatus] = useState<DailyBriefStatus>('not_linked');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [dailyBriefEpisode, setDailyBriefEpisode] = useState<Episode | null>(null);
  const [showScriptViewer, setShowScriptViewer] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Live Stations state
  const [liveStations, setLiveStations] = useState<LiveStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);

  // Deep Dive history state
  const [deepDiveHistory, setDeepDiveHistory] = useState<DeepDiveEpisode[]>([]);

  // Update status based on linked accounts
  useEffect(() => {
    if (isLinked) {
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

  // Load live stations
  useEffect(() => {
    async function loadStations() {
      try {
        setLoadingStations(true);
        const stations = await getLiveStations();
        setLiveStations(stations);
      } catch (err) {
        console.log('Failed to load live stations:', err);
      } finally {
        setLoadingStations(false);
      }
    }
    loadStations();
  }, []);

  // Load deep dive history
  useEffect(() => {
    async function loadDeepDives() {
      if (!user?.email) return;
      try {
        const history = await getDeepDiveHistory(user.email, 5);
        setDeepDiveHistory(history);
      } catch (err) {
        console.log('Failed to load deep dive history:', err);
      }
    }
    loadDeepDives();
  }, [user?.email]);

  // Filter topics
  const visibleTopics = topics.filter((t) => !preferences.hiddenTopicIds.includes(t.id));
  const bookmarkedTopics = visibleTopics.filter((t) => preferences.bookmarkedTopicIds.includes(t.id));

  // Search filtering
  const filteredTopics = searchQuery
    ? visibleTopics.filter(
        (t) =>
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : visibleTopics;

  // Group topics by category
  const topicsByCategory = categories.reduce((acc, category) => {
    acc[category] = filteredTopics.filter((t) => t.category === category);
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

  const handleConnectAccount = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const handleTopicTap = useCallback((topic: Topic) => {
    router.push(`/topics/${topic.id}`);
  }, [router]);

  const handleStationTap = useCallback(async (station: LiveStation) => {
    try {
      const result = await tuneIntoStation(station.id);
      if (result.episode?.audioUrl) {
        // Play the station's current episode
        const audio = new Audio(result.episode.audioUrl);
        audio.play();
      }
    } catch (err) {
      console.error('Failed to tune into station:', err);
    }
  }, []);

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

      {/* Tab Selector */}
      <div className="px-4 mb-4">
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setActiveTab('forYou')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'forYou'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'discover'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Discover
          </button>
        </div>
      </div>

      {/* For You Tab */}
      {activeTab === 'forYou' && (
        <div className="space-y-6">
          {/* Live Stations */}
          {liveStations.length > 0 && (
            <section className="px-4">
              <div className="flex items-center gap-2 mb-3">
                <Radio className="w-5 h-5 text-red-500" />
                <h2 className="text-lg font-bold">Live Stations</h2>
                <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                  </span>
                  LIVE
                </span>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {liveStations.slice(0, 5).map((station) => (
                  <LiveStationCard
                    key={station.id}
                    station={station}
                    onTap={() => handleStationTap(station)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Deep Dive History */}
          {deepDiveHistory.length > 0 && (
            <section className="px-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-bold">Your Deep Dives</h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {deepDiveHistory.map((dive) => (
                  <button
                    key={dive.id}
                    className="flex-shrink-0 w-48 p-4 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl text-left hover:scale-105 transition-transform"
                  >
                    <p className="text-white font-medium text-sm line-clamp-2 mb-2">
                      {dive.query}
                    </p>
                    <p className="text-white/70 text-xs">
                      {Math.round(dive.durationSeconds / 60)} min
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Your Topics (Bookmarked) */}
          {bookmarkedTopics.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-4">
                <Bookmark className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-bold">Your Topics</h2>
              </div>
              <CategoryRow
                title=""
                topics={bookmarkedTopics}
                bookmarkedIds={preferences.bookmarkedTopicIds}
                onTopicTap={handleTopicTap}
                onBookmarkToggle={toggleBookmark}
                onHideTopic={hideTopic}
              />
            </section>
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

          {/* Recommended for You */}
          {visibleTopics.length > 10 && (
            <CategoryRow
              title="Recommended for You"
              topics={visibleTopics.slice(10, 16)}
              bookmarkedIds={preferences.bookmarkedTopicIds}
              onTopicTap={handleTopicTap}
              onBookmarkToggle={toggleBookmark}
              onHideTopic={hideTopic}
            />
          )}
        </div>
      )}

      {/* Discover Tab */}
      {activeTab === 'discover' && (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="px-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className="w-full pl-10 pr-10 py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {/* Search Results or All Categories */}
          {searchQuery ? (
            <div className="px-4">
              <h2 className="text-lg font-bold mb-4">
                {filteredTopics.length} results for &quot;{searchQuery}&quot;
              </h2>
              {filteredTopics.length === 0 ? (
                <div className="text-center py-12">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No topics found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {filteredTopics.map((topic) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      isBookmarked={preferences.bookmarkedTopicIds.includes(topic.id)}
                      onTap={() => handleTopicTap(topic)}
                      onBookmarkToggle={() => toggleBookmark(topic.id)}
                      onHide={() => hideTopic(topic.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* All Topics */}
              <section className="px-4">
                <h2 className="text-lg font-bold mb-4">All Topics</h2>
                <div className="grid grid-cols-2 gap-4">
                  {visibleTopics.slice(0, 8).map((topic) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      isBookmarked={preferences.bookmarkedTopicIds.includes(topic.id)}
                      onTap={() => handleTopicTap(topic)}
                      onBookmarkToggle={() => toggleBookmark(topic.id)}
                      onHide={() => hideTopic(topic.id)}
                    />
                  ))}
                </div>
              </section>

              {/* Categories */}
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
            </>
          )}
        </div>
      )}

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
