export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface LinkedAccount {
  id: string;
  provider: 'google' | 'microsoft';
  email: string;
  emailEnabled: boolean;
  calendarEnabled: boolean;
  createdAt: string;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  targetDurationMinutes?: number;
  isActive?: boolean;
}

export interface ScriptSegment {
  speaker: 'host1' | 'host2';
  text: string;
  type?: 'intro' | 'content' | 'transition' | 'outro';
}

export interface Script {
  segments: ScriptSegment[];
  totalSegments: number;
  estimatedDurationSeconds?: number;
}

export interface Episode {
  id: string;
  title: string;
  description?: string;
  audioUrl?: string;
  durationSeconds?: number;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  createdAt: string;
  topicId?: string;
  topic?: Topic;
  script?: Script;
}

export interface GenerationJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  episode?: Episode;
  error?: {
    message: string;
    code?: string;
  };
}

export interface UserPreferences {
  voiceHost1: string;
  voiceHost2: string;
  language: string;
  includeEmail: boolean;
  includeCalendar: boolean;
  bookmarkedTopicIds: string[];
  hiddenTopicIds: string[];
  // Notification settings
  notificationsEnabled: boolean;
  briefingHour: number;
  briefingMinute: number;
  briefingTimezone: string;
  includeTopicUpdates: boolean;
}

export type DailyBriefStatus =
  | 'not_linked'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'playing'
  | 'error';
