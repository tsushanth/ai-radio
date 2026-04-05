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
import { LiveReactions } from '@/components/live/LiveReactions';
import { LiveChat } from '@/components/live/LiveChat';
import { generateEpisode, getJobStatus, getDeepDiveHistory, generateDeepDive, LIVE_STATIONS } from '@/lib/api/episodes';
import type { LiveStation, DeepDiveEpisode } from '@/lib/api/episodes';
import { DeepDiveModal } from '@/components/deepdive/DeepDiveModal';
import { DailyBriefStatus, Topic, Episode } from '@/types';
import { Loader2, Search, Radio, Sparkles, Bookmark, X, Play, Pause, Plus, Phone } from 'lucide-react';

type TabType = 'forYou' | 'discover';

interface NowPlayingInfo {
  title?: string;
  topic?: string;
  language?: string;
}

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
  const [playingStation, setPlayingStation] = useState<LiveStation | null>(null);
  const [isStationPlaying, setIsStationPlaying] = useState(false);
  const stationAudioRef = useRef<HTMLAudioElement | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingInfo | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [queueSegments, setQueueSegments] = useState<Array<{ segmentType: string; topicName: string }>>([]);
  const [pendingRequests, setPendingRequests] = useState<Array<{ topic: string; requestedAt: string }>>([]);

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

  // Fetch now playing info periodically when a station is playing
  useEffect(() => {
    if (!playingStation || !isStationPlaying) {
      setNowPlaying(null);
      return;
    }

    async function fetchNowPlaying() {
      try {
        const res = await fetch('https://radio.audexa.app/api/status');
        if (res.ok) {
          const data = await res.json();
          if (data.now_playing) {
            setNowPlaying({
              title: data.now_playing.title || data.now_playing.topic,
              topic: data.now_playing.topic,
              language: data.now_playing.language,
            });
          }
          // Update queue
          const segments = (data.ready_queue || [])
            .map((s: { segment_type: string; topic_name: string }) => ({
              segmentType: s.segment_type,
              topicName: s.topic_name.replace(/^\[\w+\]\s*/, ''),
            }))
            .filter((s: { topicName: string }) => s.topicName)
            .slice(0, 8);
          setQueueSegments(segments);
          // Pending listener requests
          const pending = (data.pending_requests || []).map((r: { topic: string; requested_at: string }) => ({
            topic: r.topic,
            requestedAt: r.requested_at,
          }));
          setPendingRequests(pending);
        }
      } catch {
        // Status API unavailable, not critical
      }
    }

    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 15000);
    return () => clearInterval(interval);
  }, [playingStation, isStationPlaying]);

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
        includeTopics: preferences.includeTopicUpdates,
        topics: preferences.bookmarkedTopicIds,
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

    // Create new audio element pointing to the Icecast stream
    const audio = new Audio(station.streamUrl);
    audio.onplay = () => setIsStationPlaying(true);
    audio.onpause = () => setIsStationPlaying(false);
    audio.onerror = () => {
      console.error('Failed to play station stream:', station.name);
      setIsStationPlaying(false);
    };

    stationAudioRef.current = audio;
    setPlayingStation(station);
    setShowChat(false);
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
    setNowPlaying(null);
    setShowChat(false);
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
    <div className={`pb-8 ${playingStation ? (showChat || showQueue ? 'pb-96' : 'pb-48') : ''}`}>
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

            {/* Call-in Banner */}
            <div className="mb-4 p-4 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl text-white">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/20 rounded-full flex-shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm mb-1">Request a Topic!</p>
                  <a
                    href="tel:+18333981230"
                    className="text-lg font-bold hover:underline block"
                  >
                    +1 (833) 398-1230
                  </a>
                  <p className="text-xs text-white/80 mt-1">
                    Or type <span className="font-mono bg-white/20 px-1 rounded">@audexa</span> + topic in the chat
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {LIVE_STATIONS.map((station) => (
                <LiveStationCard
                  key={station.id}
                  station={station}
                  isPlaying={playingStation?.id === station.id && isStationPlaying}
                  onTap={() => handleStationTap(station)}
                />
              ))}
            </div>
          </section>

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

      {/* Enhanced Live Station Mini Player */}
      {playingStation && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          {/* Queue Section (expandable) */}
          {showQueue && (
            <div className="bg-gray-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 max-w-md mx-auto max-h-64 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white/70 text-xs font-bold">UP NEXT</span>
                <span className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/50 font-bold">{queueSegments.length}</span>
              </div>
              {queueSegments.length === 0 ? (
                <p className="text-white/40 text-xs">Queue is building...</p>
              ) : (
                <div className="space-y-1.5">
                  {queueSegments.map((seg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-white/30 text-xs w-4">{i + 1}</span>
                      <span className="text-white/80 text-xs flex-1 truncate">{seg.topicName}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                        seg.segmentType === 'headlines' ? 'bg-blue-500/40 text-blue-200' :
                        seg.segmentType === 'deep_dive' ? 'bg-purple-500/40 text-purple-200' :
                        seg.segmentType === 'debate' ? 'bg-red-500/40 text-red-200' :
                        seg.segmentType === 'listener_request' ? 'bg-orange-500/40 text-orange-200' :
                        seg.segmentType === 'advice' ? 'bg-green-500/40 text-green-200' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {seg.segmentType.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Pending Listener Requests */}
              {pendingRequests.length > 0 && (
                <div className="mt-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-orange-400/70 text-xs font-bold">REQUESTED</span>
                    <span className="px-1.5 py-0.5 bg-orange-500/20 rounded text-[10px] text-orange-300 font-bold">{pendingRequests.length}</span>
                  </div>
                  {pendingRequests.map((req, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5">
                      <span className="text-orange-400 text-xs">🎙️</span>
                      <span className="text-orange-200/80 text-xs flex-1 truncate">{req.topic}</span>
                      <span className="px-1.5 py-0.5 bg-orange-500/30 rounded text-[9px] text-orange-200 font-semibold animate-pulse">generating</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Call-in prompt */}
              <div className="mt-3 pt-2 border-t border-white/10">
                <a href="tel:+18333981230" className="flex items-center gap-2 text-orange-400 hover:text-orange-300 transition-colors">
                  <span className="text-sm">📞</span>
                  <span className="text-xs font-medium">Call (833) 398-1230 to request a topic</span>
                </a>
              </div>
            </div>
          )}

          {/* Chat Section (expandable) */}
          {showChat && (
            <div className="bg-gray-900/95 backdrop-blur-sm border-t border-white/10 px-4 py-3 max-w-md mx-auto">
              <LiveChat
                username={user?.name || user?.email || 'Listener'}
              />
            </div>
          )}

          {/* Main Player Bar */}
          <div className="bg-gradient-to-r from-red-700 to-red-600 text-white shadow-2xl relative">
            <div className="max-w-md mx-auto">
              {/* Now Playing + Controls Row */}
              <div className="flex items-center gap-3 p-3">
                {/* Station Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: playingStation.color }}
                >
                  <span className="text-2xl">{playingStation.icon}</span>
                </div>

                {/* Station Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate">
                      {playingStation.icon} {playingStation.name}
                    </span>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500 rounded text-[10px] font-bold flex-shrink-0">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                      </span>
                      LIVE
                    </span>
                  </div>
                  <p className="text-xs text-white/70 truncate mt-0.5">
                    {nowPlaying?.title || nowPlaying?.topic || playingStation.description}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Queue Toggle */}
                  <button
                    onClick={() => { setShowQueue(!showQueue); if (!showQueue) setShowChat(false); }}
                    className={`p-2 rounded-full transition-colors ${showQueue ? 'bg-white/30' : 'hover:bg-white/20'}`}
                    title="Show queue"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>

                  {/* Chat Toggle */}
                  <button
                    onClick={() => { setShowChat(!showChat); if (!showChat) setShowQueue(false); }}
                    className={`p-2 rounded-full transition-colors ${showChat ? 'bg-white/30' : 'hover:bg-white/20'}`}
                    title="Toggle chat"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>

                  {/* Play/Pause */}
                  <button
                    onClick={() => handleStationTap(playingStation)}
                    className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md"
                  >
                    {isStationPlaying ? (
                      <Pause className="w-5 h-5 text-red-600" />
                    ) : (
                      <Play className="w-5 h-5 text-red-600 ml-0.5" />
                    )}
                  </button>

                  {/* Close */}
                  <button
                    onClick={handleStopStation}
                    className="p-2 hover:bg-white/20 rounded-full"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Reactions Row */}
              <div className="px-3 pb-3">
                <LiveReactions className="w-full" />
              </div>
            </div>
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
