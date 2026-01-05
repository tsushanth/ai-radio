'use client';

import { Topic } from '@/types';
import { Bookmark, MoreVertical, EyeOff, Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useState, useRef, useEffect } from 'react';

interface TopicCardProps {
  topic: Topic;
  isBookmarked: boolean;
  onTap: () => void;
  onBookmarkToggle: () => void;
  onHide: () => void;
}

// Map icon names to emoji or default
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

export function TopicCard({
  topic,
  isBookmarked,
  onTap,
  onBookmarkToggle,
  onHide,
}: TopicCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      onClick={onTap}
      className="relative flex-shrink-0 w-40 rounded-xl overflow-hidden cursor-pointer group"
      style={{ backgroundColor: topic.color || '#f97316' }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

      {/* Content */}
      <div className="relative p-4 h-48 flex flex-col justify-between text-white">
        {/* Top row - icon and actions */}
        <div className="flex justify-between items-start">
          <span className="text-3xl">{getTopicIcon(topic.icon)}</span>
          <div className="flex gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmarkToggle();
              }}
              className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <Bookmark
                className={cn('w-4 h-4', isBookmarked ? 'fill-white' : '')}
              />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 z-10 min-w-32">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onHide();
                      setShowMenu(false);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <EyeOff className="w-4 h-4" />
                    Hide topic
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom - name, duration, and play button */}
        <div>
          <div className="flex items-end justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-base leading-tight mb-1">{topic.name}</h3>
              <p className="text-xs text-white/70 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {topic.targetDurationMinutes || 5} min
              </p>
            </div>
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-orange-600 ml-0.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
