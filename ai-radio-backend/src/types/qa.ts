/**
 * Interactive Q&A Types
 * Definitions for follow-up questions about content
 */

/**
 * Q&A context type - what content the Q&A is about
 */
export type QAContextType =
  | 'topic'
  | 'deep_dive'
  | 'live_station'
  | 'daily_brief';

/**
 * Q&A message role
 */
export type QAMessageRole = 'user' | 'assistant' | 'system';

/**
 * Q&A source type
 */
export type QASourceType = 'web' | 'episode' | 'transcript' | 'research';

/**
 * Q&A session
 */
export interface QASession {
  id: string;
  userId: string;
  contextType: QAContextType;
  contextId: string;
  contextTitle: string;
  messages: QAMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Q&A message
 */
export interface QAMessage {
  id: string;
  sessionId: string;
  role: QAMessageRole;
  content: string;
  audioUrl?: string;
  audioPath?: string;
  durationSeconds?: number;
  sources?: QASource[];
  createdAt: Date;
}

/**
 * Q&A source (citation)
 */
export interface QASource {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
  type: QASourceType;
}

/**
 * Ask question request
 */
export interface QAAskRequest {
  question: string;
  contextType: QAContextType;
  contextId: string;
  sessionId?: string;
  includeAudio?: boolean;
  userId: string;
}

/**
 * Ask question response
 */
export interface QAAskResponse {
  session: QASession;
  answer: QAMessage;
  suggestedQuestions?: string[];
}

/**
 * Q&A session history response
 */
export interface QASessionHistoryResponse {
  sessions: QASession[];
  total: number;
  hasMore: boolean;
}

/**
 * Q&A session detail response
 */
export interface QASessionDetailResponse {
  session: QASession;
}

/**
 * Database record for Q&A session
 */
export interface QASessionDbRecord {
  id: string;
  user_id: string;
  context_type: QAContextType;
  context_id: string;
  context_title: string;
  created_at: string;
  updated_at: string;
}

/**
 * Database record for Q&A message
 */
export interface QAMessageDbRecord {
  id: string;
  session_id: string;
  role: QAMessageRole;
  content: string;
  audio_url?: string;
  audio_path?: string;
  duration_seconds?: number;
  sources?: string; // JSON stringified
  created_at: string;
}

/**
 * Context for Q&A (retrieved from original content)
 */
export interface QAContext {
  type: QAContextType;
  id: string;
  title: string;
  transcript?: string;
  summary?: string;
  sources?: QASource[];
}

/**
 * Internal: Generate answer request
 */
export interface QAGenerateAnswerRequest {
  question: string;
  context: QAContext;
  previousMessages?: QAMessage[];
  includeAudio?: boolean;
}
