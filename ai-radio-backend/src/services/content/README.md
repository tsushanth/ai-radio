# Content Services

This directory contains services for aggregating content and generating topic-based podcasts.

## Overview

Topic-based podcasts are daily episodes generated from aggregated content sources. Each topic has predefined sources (RSS feeds, Reddit, HackerNews) that are fetched and summarized into a podcast.

## Services

### ContentAggregatorService (`aggregator.service.ts`)

Fetches and aggregates content from various sources:

- **RSS Feeds**: Parses any RSS/Atom feed
- **Reddit**: Fetches top posts from subreddits via Reddit API
- **HackerNews**: Fetches top stories with optional keyword filtering

### TopicPodcastGenerator (`topic.generator.ts`)

Manages the generation and caching of topic podcasts:

- Checks if today's episode already exists
- Generates new episodes on first request
- Caches episodes for the entire day
- Tracks play counts

## Flow

1. User taps "Play" on a topic
2. Backend checks if today's episode exists:
   - **Exists (completed)**: Return cached episode
   - **Exists (generating)**: Return "please wait" message
   - **Not exists**: Start generation
3. Generation process:
   1. Fetch content from all sources
   2. Deduplicate and rank stories
   3. Generate script using GPT-4
   4. Convert script to audio using TTS
   5. Upload to public storage
   6. Cache metadata in database

## Database Schema

```sql
CREATE TABLE topic_episodes (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL, -- 'not_generated', 'generating', 'completed', 'failed'
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT,
  audio_path TEXT,
  duration_seconds INTEGER,
  script TEXT,
  stories JSONB,
  generated_at TIMESTAMPTZ,
  generated_by TEXT,
  play_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_id, date)
);

CREATE INDEX idx_topic_episodes_topic_date ON topic_episodes(topic_id, date);
CREATE INDEX idx_topic_episodes_date ON topic_episodes(date);

-- Function to increment play count
CREATE OR REPLACE FUNCTION increment_play_count(episode_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE topic_episodes
  SET play_count = play_count + 1
  WHERE id = episode_id;
END;
$$ LANGUAGE plpgsql;
```

## Topics

Topics are defined in `/src/config/topics.ts`. Each topic includes:

- **id**: Unique identifier
- **name**: Display name
- **description**: Brief description
- **icon**: SF Symbol name for iOS
- **color**: Hex color for UI
- **category**: Grouping category
- **sources**: Array of content sources
- **promptContext**: Additional context for LLM
- **targetDurationMinutes**: Target podcast length
- **isActive**: Whether topic is available

## Adding New Topics

1. Add topic definition in `topics.ts`
2. Define content sources (RSS URLs, subreddits, keywords)
3. Deploy - topic will be automatically available

## Storage

Topic podcasts use a **public** Supabase bucket since they contain no PII:
- Bucket: `topic-podcasts`
- Path: `{topic_id}/{date}.mp3`
- URLs are public and don't require authentication
