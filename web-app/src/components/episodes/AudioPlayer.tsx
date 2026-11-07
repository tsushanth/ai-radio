'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Moon } from 'lucide-react';
import { useOptionalPlayback } from '@/components/player/PlaybackProvider';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { SLEEP_OPTIONS_MIN, formatRemaining } from '@/lib/sleep-timer';
import { bindMediaSession } from '@/lib/media-session';
import { listenStart, listenStop, type ListenContext } from '@/lib/analytics';

interface AudioPlayerProps {
  src: string;
  title: string;
  autoPlay?: boolean;
  /** What this audio is, for anonymous listening stats. */
  listen?: ListenContext;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ src, title, autoPlay = false, listen }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [sleepMin, setSleepMin] = useState(0);
  const playback = useOptionalPlayback();
  const listenRef = useRef(listen);
  useEffect(() => { listenRef.current = listen; }, [listen]);

  // Sleep timer: pause when it runs out
  const sleep = useSleepTimer(
    useCallback(() => {
      audioRef.current?.pause();
      setSleepMin(0);
    }, [])
  );

  // Leaving the page must stop this episode (the <audio> is removed with the page, but be explicit)
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (listenRef.current) listenStop();
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      // Auto-play when metadata is loaded and autoPlay is true
      if (autoPlay && !hasAutoPlayed) {
        audio.play().then(() => {
          setIsPlaying(true);
          setHasAutoPlayed(true);
        }).catch(err => {
          console.log('Auto-play prevented by browser:', err);
        });
      }
    };
    const handleEnded = () => { setIsPlaying(false); if (listenRef.current) listenStop(); };
    // Keep the button in step with the element (media keys, sleep timer, autoplay being blocked)
    const handlePlay = () => { setIsPlaying(true); setHasStarted(true); if (listenRef.current) listenStart(listenRef.current); };
    const handlePause = () => { setIsPlaying(false); if (listenRef.current) listenStop(); };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [autoPlay, hasAutoPlayed]);

  // Browser media keys / OS now-playing widget, from the first play until this player goes away
  useEffect(() => {
    if (!hasStarted) return;
    const audio = audioRef.current;
    return bindMediaSession(
      typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof bindMediaSession>[0]),
      { title },
      {
        play: () => { audio?.play().catch(() => {}); },
        pause: () => audio?.pause(),
        seekBackward: () => { if (audio) audio.currentTime = Math.max(0, audio.currentTime - 15); },
        seekForward: () => { if (audio) audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15); },
      },
      typeof MediaMetadata === 'undefined' ? undefined : (MediaMetadata as unknown as new (init: Record<string, unknown>) => unknown),
      isPlaying
    );
  }, [hasStarted, title, isPlaying]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      // Do not play on top of the live station / daily brief
      playback?.stop();
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, duration));
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  };

  const changeSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % speeds.length;
    const newRate = speeds[nextIndex];
    audio.playbackRate = newRate;
    setPlaybackRate(newRate);
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-white rounded-xl border p-6 shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Title */}
      <h2 className="text-lg font-semibold mb-4 text-center">{title}</h2>

      {/* Progress Bar */}
      <div className="mb-4">
        <input
          type="range"
          min={0}
          max={duration || 0}
          value={currentTime}
          onChange={seek}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => skip(-15)}
          className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <SkipBack className="w-6 h-6" />
        </button>

        <button
          onClick={togglePlay}
          className="w-14 h-14 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center text-white transition-colors"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </button>

        <button
          onClick={() => skip(15)}
          className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <SkipForward className="w-6 h-6" />
        </button>
      </div>

      {/* Speed Control + Sleep timer */}
      <div className="flex items-center justify-center gap-3 mt-4">
        <button
          onClick={changeSpeed}
          className="px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {playbackRate}x
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <Moon className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">Sleep timer</span>
          <select
            value={sleepMin}
            aria-label="Sleep timer"
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (minutes === 0) {
                sleep.cancel();
                setSleepMin(0);
              } else {
                sleep.start(minutes);
                setSleepMin(minutes);
              }
            }}
            className="h-8 rounded-md border border-gray-300 px-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value={0}>Sleep: off</option>
            {SLEEP_OPTIONS_MIN.map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </label>
      </div>
      {sleep.active && (
        <p className="text-center text-xs text-gray-500 mt-2" role="status">
          Pausing in {formatRemaining(sleep.remainingMs)}
        </p>
      )}
    </div>
  );
}
