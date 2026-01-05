'use client';

import { Play, Pause, Loader2, RefreshCw, Link2, FileText } from 'lucide-react';
import { DailyBriefStatus } from '@/types';

interface GradientHeaderProps {
  status: DailyBriefStatus;
  progress: number;
  userName?: string;
  hasScript?: boolean;
  onGenerate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onConnectAccount: () => void;
  onViewScript?: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getProgressMessage(progress: number): string {
  if (progress < 20) return 'Fetching your emails...';
  if (progress < 40) return 'Analyzing content...';
  if (progress < 60) return 'Creating script...';
  if (progress < 80) return 'Generating audio...';
  return 'Almost ready...';
}

export function GradientHeader({
  status,
  progress,
  userName,
  hasScript,
  onGenerate,
  onPlay,
  onPause,
  onConnectAccount,
  onViewScript,
}: GradientHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-800 via-orange-700 to-orange-500 p-6 text-white">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="relative z-10">
        {/* Greeting */}
        <h1 className="text-2xl font-bold mb-1">{getGreeting()}</h1>
        {userName && <p className="text-white/80 text-lg mb-1">{userName}</p>}
        <p className="text-white/60 text-sm mb-6">Daily Brief • {getTodayDate()}</p>

        {/* Action area based on status */}
        {status === 'not_linked' && (
          <button
            onClick={onConnectAccount}
            className="flex items-center gap-3 w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-colors"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Link2 className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Connect your email</p>
              <p className="text-sm text-white/70">Get personalized daily briefings</p>
            </div>
          </button>
        )}

        {status === 'ready' && (
          <button
            onClick={onGenerate}
            className="flex items-center gap-3 w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-colors"
          >
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <Play className="w-6 h-6 text-orange-600 ml-1" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Generate Today&apos;s Brief</p>
              <p className="text-sm text-white/70">From your emails and calendar</p>
            </div>
          </button>
        )}

        {status === 'generating' && (
          <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <p className="font-semibold">Generating your brief...</p>
                <p className="text-sm text-white/70">{getProgressMessage(progress)}</p>
              </div>
            </div>
            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-right text-sm text-white/70 mt-1">{progress}%</p>
          </div>
        )}

        {status === 'completed' && (
          <div className="space-y-2">
            <button
              onClick={onPlay}
              className="flex items-center gap-3 w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-colors"
            >
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                <Play className="w-6 h-6 text-orange-600 ml-1" />
              </div>
              <div className="text-left flex-1">
                <p className="font-semibold">Your Daily Brief is ready</p>
                <p className="text-sm text-white/70">Tap to play</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate();
                }}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </button>
            {hasScript && onViewScript && (
              <button
                onClick={onViewScript}
                className="flex items-center justify-center gap-2 w-full bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl p-3 transition-colors text-sm"
              >
                <FileText className="w-4 h-4" />
                View Script
              </button>
            )}
          </div>
        )}

        {status === 'playing' && (
          <button
            onClick={onPause}
            className="flex items-center gap-3 w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl p-4 transition-colors"
          >
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <Pause className="w-6 h-6 text-orange-600" />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold">Now Playing</p>
              <p className="text-sm text-white/70">Your Daily Brief</p>
            </div>
            {/* Equalizer animation */}
            <div className="flex items-end gap-1 h-6">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-white rounded-full animate-pulse"
                  style={{
                    height: `${Math.random() * 100}%`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          </button>
        )}

        {status === 'error' && (
          <button
            onClick={onGenerate}
            className="flex items-center gap-3 w-full bg-red-500/30 hover:bg-red-500/40 backdrop-blur-sm rounded-xl p-4 transition-colors"
          >
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-semibold">Generation failed</p>
              <p className="text-sm text-white/70">Tap to retry</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
