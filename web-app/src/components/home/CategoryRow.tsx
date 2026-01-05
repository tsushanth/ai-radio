'use client';

import { Topic } from '@/types';
import { TopicCard } from './TopicCard';
import { ChevronRight } from 'lucide-react';

interface CategoryRowProps {
  title: string;
  topics: Topic[];
  bookmarkedIds: string[];
  onTopicTap: (topic: Topic) => void;
  onBookmarkToggle: (topicId: string) => void;
  onHideTopic: (topicId: string) => void;
  showSeeAll?: boolean;
  onSeeAll?: () => void;
}

export function CategoryRow({
  title,
  topics,
  bookmarkedIds,
  onTopicTap,
  onBookmarkToggle,
  onHideTopic,
  showSeeAll,
  onSeeAll,
}: CategoryRowProps) {
  if (topics.length === 0) return null;

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {showSeeAll && onSeeAll && (
          <button
            onClick={onSeeAll}
            className="flex items-center text-sm text-orange-500 hover:text-orange-600"
          >
            See all
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Horizontal scroll */}
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
        {topics.map((topic) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            isBookmarked={bookmarkedIds.includes(topic.id)}
            onTap={() => onTopicTap(topic)}
            onBookmarkToggle={() => onBookmarkToggle(topic.id)}
            onHide={() => onHideTopic(topic.id)}
          />
        ))}
      </div>
    </div>
  );
}
