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
import { generateEpisode, getJobStatus, getLiveStations, getDeepDiveHistory, generateDeepDive } from '@/lib/api/episodes';
import type { LiveStation, DeepDiveEpisode } from '@/lib/api/episodes';
import { DeepDiveModal } from '@/components/deepdive/DeepDiveModal';
import { DailyBriefStatus, Topic, Episode } from '@/types';
import { Loader2, Search, Radio, Sparkles, Bookmark, X, Play, Pause, Plus } from 'lucide-react';

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
  const [playingStation, setPlayingStation] = useState<LiveStation | null>(null);
  const [isStationPlaying, setIsStationPlaying] = useState(false);
  const stationAudioRef = useRef<HTMLAudioElement | null>(null);

  // Deep Dive history state
  const [deepDiveHistory, setDeepDiveHistory] = useState<DeepDiveEpisode[]>([]);
  const [showDeepDiveModal, setShowDeepDiveModal] = useState(false);
  const [isGeneratingDeepDive, setIsGeneratingDeepDive] = useState(false);

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

  const handleStationTap = useCallback((station: LiveStation) => {
    // If clicking the same station that's playing, toggle play/pause
    if (playingStation?.id === station.id && stationAudioRef.current) {
      if (isStationPlaying) {
        stationAudioRef.current.pause();
        setIsStationPlaying(false);
      } else {
        stationAudioRef.current.play();
        setIsStationPlaying(true);
      }
      return;
    }

    // Stop any existing playback
    if (stationAudioRef.current) {
      stationAudioRef.current.pause();
      stationAudioRef.current = null;
    }

    // Check if station has a current episode with audio
    const audioUrl = station.currentEpisode?.audioUrl;
    if (!audioUrl) {
      console.log('No audio available for station:', station.name);
      return;
    }

    // Create new audio and play
    const audio = new Audio(audioUrl);
    audio.onended = () => {
      setIsStationPlaying(false);
    };
    audio.onplay = () => setIsStationPlaying(true);
    audio.onpause = () => setIsStationPlaying(false);

    stationAudioRef.current = audio;
    setPlayingStation(station);
    audio.play().catch(err => {
      console.error('Failed to play station:', err);
      setPlayingStation(null);
    });
  }, [playingStation, isStationPlaying]);

  const handleStopStation = useCallback(() => {
    if (stationAudioRef.current) {
      stationAudioRef.current.pause();
      stationAudioRef.current = null;
    }
    setPlayingStation(null);
    setIsStationPlaying(false);
  }, []);

  const handleGenerateDeepDive = useCallback(async (query: string, options: { language: string; durationMinutes: number }) => {
    if (!user?.email) return;

    setIsGeneratingDeepDive(true);
    try {
      const episode = await generateDeepDive(user.email, query, {
        language: options.language,
        targetDurationMinutes: options.durationMinutes,
      });

      // Add to history
      setDeepDiveHistory(prev => [episode, ...prev]);
      setShowDeepDiveModal(false);

      // Auto-play the generated episode
      if (episode.audioUrl) {
        const audio = new Audio(episode.audioUrl);
        audio.play().catch(console.error);
      }
    } catch (err) {
      console.error('Failed to generate deep dive:', err);
      alert('Failed to generate deep dive. Please try again.');
    } finally {
      setIsGeneratingDeepDive(false);
    }
  }, [user?.email]);

  if (topicsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className={`pb-8 ${playingStation ? 'pb-24' : ''}`}>
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
              {/* All Topics Grid */}
              <section className="px-4">
                <h2 className="text-lg font-bold mb-4">All Topics ({visibleTopics.length})</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {visibleTopics.map((topic) => (
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

      {/* Live Station Mini Player */}
      {playingStation && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-red-600 to-red-500 text-white p-4 shadow-lg z-50">
          <div className="max-w-md mx-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-xs font-bold">LIVE</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{playingStation.name}</p>
              <p className="text-xs text-white/70 truncate">
                {playingStation.currentEpisode?.title || playingStation.description}
              </p>
            </div>
            <button
              onClick={() => handleStationTap(playingStation)}
              className="w-10 h-10 bg-white rounded-full flex items-center justify-center"
            >
              {isStationPlaying ? (
                <Pause className="w-5 h-5 text-red-600" />
              ) : (
                <Play className="w-5 h-5 text-red-600 ml-0.5" />
              )}
            </button>
            <button
              onClick={handleStopStation}
              className="p-2 hover:bg-white/20 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Deep Dive FAB */}
      {!playingStation && (
        <button
          onClick={() => setShowDeepDiveModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center z-40"
          title="Create Deep Dive"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Deep Dive Modal */}
      <DeepDiveModal
        isOpen={showDeepDiveModal}
        onClose={() => setShowDeepDiveModal(false)}
        onGenerate={handleGenerateDeepDive}
        isGenerating={isGeneratingDeepDive}
      />
    </div>
  );
}
