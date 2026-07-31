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
  streamUrl: string;
  language: string;
}

export const LIVE_STATIONS: LiveStation[] = [
  { id: 'en', name: 'Audexa Radio', description: 'English \u2022 News, Talk & Advice', icon: '\u{1F1FA}\u{1F1F8}', color: '#EF4444', streamUrl: 'https://radio.audexa.app/stream', language: 'en' },
  { id: 'es', name: 'Audexa Espa\u00f1ol', description: 'Spanish \u2022 Noticias y Consejos', icon: '\u{1F1EA}\u{1F1F8}', color: '#F59E0B', streamUrl: 'https://radio.audexa.app/stream-es', language: 'es' },
  { id: 'hi', name: 'Audexa Hindi', description: 'Hindi \u2022 \u0938\u092E\u093E\u091A\u093E\u0930 \u0914\u0930 \u091A\u0930\u094D\u091A\u093E', icon: '\u{1F1EE}\u{1F1F3}', color: '#F97316', streamUrl: 'https://radio.audexa.app/stream-hi', language: 'hi' },
  { id: 'pt', name: 'Audexa Portugu\u00eas', description: 'Portuguese \u2022 Not\u00edcias e Dicas', icon: '\u{1F1E7}\u{1F1F7}', color: '#10B981', streamUrl: 'https://radio.audexa.app/stream-pt', language: 'pt' },
  { id: 'fr', name: 'Audexa Fran\u00e7ais', description: 'French \u2022 Actualit\u00e9s et Conseils', icon: '\u{1F1EB}\u{1F1F7}', color: '#3B82F6', streamUrl: 'https://radio.audexa.app/stream-fr', language: 'fr' },
  { id: 'de', name: 'Audexa Deutsch', description: 'German \u2022 Nachrichten und Tipps', icon: '\u{1F1E9}\u{1F1EA}', color: '#6366F1', streamUrl: 'https://radio.audexa.app/stream-de', language: 'de' },
  { id: 'ja', name: 'Audexa Japanese', description: 'Japanese \u2022 \u30CB\u30E5\u30FC\u30B9\u3068\u30C8\u30FC\u30AF', icon: '\u{1F1EF}\u{1F1F5}', color: '#EC4899', streamUrl: 'https://radio.audexa.app/stream-ja', language: 'ja' },
  { id: 'ko', name: 'Audexa Korean', description: 'Korean \u2022 \uB274\uC2A4\uC640 \uD1A0\uD06C', icon: '\u{1F1F0}\u{1F1F7}', color: '#8B5CF6', streamUrl: 'https://radio.audexa.app/stream-ko', language: 'ko' },
  { id: 'zh', name: 'Audexa Chinese', description: 'Chinese \u2022 \u65B0\u95FB\u4E0E\u8BA8\u8BBA', icon: '\u{1F1E8}\u{1F1F3}', color: '#DC2626', streamUrl: 'https://radio.audexa.app/stream-zh', language: 'zh' },
  { id: 'it', name: 'Audexa Italiano', description: 'Italian \u2022 Notizie e Consigli', icon: '\u{1F1EE}\u{1F1F9}', color: '#059669', streamUrl: 'https://radio.audexa.app/stream-it', language: 'it' },
];

// Deep Dive removed from web. Feature is iOS-only (on-device synthesis on
// eligible devices). Cloud rendering was too slow + expensive to be worth
// keeping a web surface.
