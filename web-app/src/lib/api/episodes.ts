import { apiClient } from './client';
import { Episode, GenerationJob, Topic, LinkedAccount } from '@/types';

interface TopicsResponse {
  success: boolean;
  data: {
    topics: Topic[];
    categories: { id: string; name: string; count: number }[];
  };
}

export async function getTopics(): Promise<{ topics: Topic[]; categories: string[] }> {
  const response = await apiClient<TopicsResponse>('/topics');
  // Extract topics and category names from the response
  return {
    topics: response.data.topics,
    categories: response.data.categories.map(c => c.name),
  };
}

export async function getEpisodes(userId: string): Promise<{ episodes: Episode[] }> {
  return apiClient(`/podcast/episodes/${userId}`);
}

export async function getEpisode(episodeId: string): Promise<Episode> {
  return apiClient(`/podcast/episode/${episodeId}`);
}

export async function generateEpisode(
  email: string,
  options?: {
    voiceHost1?: string;
    voiceHost2?: string;
    language?: string;
    includeEmail?: boolean;
    includeCalendar?: boolean;
    includeTopics?: boolean;
    topics?: string[];
  }
): Promise<{ jobId: string }> {
  // Format request to match backend schema
  const now = new Date();
  const briefingTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  return apiClient('/podcast/generate-async', {
    method: 'POST',
    body: JSON.stringify({
      user_id: email,
      date: now.toISOString().split('T')[0],
      preferences: {
        briefing_time: briefingTime,
        voice_host1: options?.voiceHost1 || 'nova',
        voice_host2: options?.voiceHost2 || 'onyx',
        language: options?.language || 'en',
        include_email: options?.includeEmail ?? true,
        include_calendar: options?.includeCalendar ?? true,
        include_topics: options?.includeTopics ?? true,
        topics: options?.topics || [],
      },
    }),
  });
}

export async function getJobStatus(jobId: string): Promise<GenerationJob> {
  return apiClient(`/podcast/job/${jobId}`);
}

export async function deleteEpisode(episodeId: string): Promise<void> {
  return apiClient(`/podcast/episode/${episodeId}`, { method: 'DELETE' });
}

// Topic episode generation
interface TopicEpisodeResponse {
  success: boolean;
  data: Episode;
}

export async function getTopicEpisode(topicId: string): Promise<Episode | null> {
  try {
    const response = await apiClient<TopicEpisodeResponse>(`/topics/${topicId}/episode`);
    return response.data;
  } catch {
    // No episode exists yet
    return null;
  }
}

export async function generateTopicEpisode(topicId: string): Promise<Episode> {
  // Topic generation is synchronous - it returns the episode directly
  const response = await apiClient<TopicEpisodeResponse>(`/topics/${topicId}/generate`, {
    method: 'POST',
    body: JSON.stringify({ forceRegenerate: true }),
  });
  return response.data;
}

// Get recent episodes for a topic
interface TopicEpisodesResponse {
  success: boolean;
  data: {
    topicId: string;
    language: string;
    episodes: Episode[];
  };
}

export async function getTopicEpisodes(topicId: string, limit: number = 7): Promise<Episode[]> {
  const response = await apiClient<TopicEpisodesResponse>(`/topics/${topicId}/episodes?limit=${limit}`);
  return response.data.episodes;
}

// Linked accounts
export async function getLinkedAccounts(userId: string): Promise<{ linkedAccounts: LinkedAccount[] }> {
  return apiClient(`/linked-accounts/${userId}`);
}

export async function getAuthStatus(userId: string): Promise<{ google: { connected: boolean }; microsoft: { connected: boolean } }> {
  return apiClient(`/auth/status?userId=${encodeURIComponent(userId)}`);
}

export async function disconnectAccount(userId: string, provider: string): Promise<void> {
  return apiClient(`/auth/revoke/${provider}`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// Live Stations
export interface LiveStation {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  refreshIntervalMinutes: number;
  isActive: boolean;
  listenerCount: number;
  currentEpisode?: {
    id: string;
    title: string;
    audioUrl: string;
    durationSeconds: number;
    generatedAt: string;
  };
}

interface LiveStationsResponse {
  success: boolean;
  data: {
    stations: LiveStation[];
  };
}

export async function getLiveStations(): Promise<LiveStation[]> {
  const response = await apiClient<LiveStationsResponse>('/livestation');
  return response.data.stations || [];
}

export async function tuneIntoStation(stationId: string): Promise<{ episode: Episode }> {
  return apiClient(`/livestation/${stationId}/tune-in`, {
    method: 'POST',
  });
}

// Deep Dive
export interface DeepDiveEpisode {
  id: string;
  query: string;
  title: string;
  description: string;
  audioUrl: string;
  durationSeconds: number;
  status: 'pending' | 'researching' | 'generating' | 'completed' | 'failed';
  language: string;
  sources: {
    url: string;
    title: string;
    domain: string;
    snippet: string;
  }[];
  generatedAt: string;
  userId: string;
}

interface DeepDiveHistoryResponse {
  success: boolean;
  data: {
    episodes: DeepDiveEpisode[];
  };
}

export async function getDeepDiveHistory(userId: string, limit: number = 10): Promise<DeepDiveEpisode[]> {
  const response = await apiClient<DeepDiveHistoryResponse>(`/deepdive/history?userId=${encodeURIComponent(userId)}&limit=${limit}`);
  return response.data.episodes || [];
}

export async function generateDeepDive(
  userId: string,
  query: string,
  options?: {
    language?: string;
    targetDurationMinutes?: number;
  }
): Promise<DeepDiveEpisode> {
  const response = await apiClient<{ success: boolean; data: { episode: DeepDiveEpisode } }>('/deepdive/generate', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      query,
      language: options?.language || 'en',
      targetDurationMinutes: options?.targetDurationMinutes || 10,
    }),
  });
  return response.data.episode;
}
