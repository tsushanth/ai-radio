/**
 * Q&A Generator Service
 * Generates answers to follow-up questions about content
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/environment';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import type {
  QASession,
  QAMessage,
  QASource,
  QAAskRequest,
  QAAskResponse,
  QASessionHistoryResponse,
  QASessionDetailResponse,
  QASessionDbRecord,
  QAMessageDbRecord,
  QAContext,
  QAContextType,
} from '../../types/qa';

export class QAGenerator {
  private supabase: SupabaseClient | null = null;
  private anthropic: Anthropic;
  private readonly BUCKET = 'qa-audio';
  private readonly SESSIONS_TABLE = 'qa_sessions';
  private readonly MESSAGES_TABLE = 'qa_messages';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
    }
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  /**
   * Initialize storage bucket for Q&A audio
   */
  private async initializeBucket(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.BUCKET);

      if (!bucketExists) {
        console.log(`Creating bucket '${this.BUCKET}'...`);
        await this.supabase.storage.createBucket(this.BUCKET, {
          public: true,
          fileSizeLimit: 10485760, // 10MB for short answers
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
        });
        console.log(`Bucket '${this.BUCKET}' created`);
      }
    } catch (error) {
      console.error('Failed to initialize Q&A bucket:', error);
    }
  }

  /**
   * Ask a question and get an answer
   */
  async askQuestion(request: QAAskRequest): Promise<QAAskResponse> {
    const { question, contextType, contextId, sessionId, includeAudio = false, userId } = request;

    // Validate
    if (!question || question.trim().length === 0) {
      throw new Error('Question cannot be empty');
    }

    if (question.length > 500) {
      throw new Error('Question must be 500 characters or less');
    }

    console.log(`[Q&A] Processing question: "${question.substring(0, 50)}..."`);

    // Get or create session
    let session: QASession;
    if (sessionId) {
      const existingSession = await this.getSession(sessionId, userId);
      if (!existingSession) {
        throw new Error('Session not found');
      }
      session = existingSession;
    } else {
      session = await this.createSession(userId, contextType, contextId);
    }

    // Add user message
    const userMessage: QAMessage = {
      id: `msg-${Date.now()}-user`,
      sessionId: session.id,
      role: 'user',
      content: question.trim(),
      createdAt: new Date(),
    };

    session.messages.push(userMessage);
    await this.saveMessage(userMessage);

    // Get context from original content
    const context = await this.getContext(contextType, contextId);

    // Generate answer
    console.log(`  [1/2] Generating answer...`);
    const answerContent = await this.generateAnswer(question, context, session.messages.slice(0, -1));

    // Generate audio if requested
    let audioUrl: string | undefined;
    let durationSeconds: number | undefined;

    if (includeAudio) {
      console.log(`  [2/2] Generating audio...`);
      const audioResult = await this.generateAudioAnswer(answerContent, session.id, userMessage.id);
      audioUrl = audioResult.audioUrl;
      durationSeconds = audioResult.durationSeconds;
    }

    // Create assistant message
    const assistantMessage: QAMessage = {
      id: `msg-${Date.now()}-assistant`,
      sessionId: session.id,
      role: 'assistant',
      content: answerContent.answer,
      audioUrl,
      durationSeconds,
      sources: answerContent.sources,
      createdAt: new Date(),
    };

    session.messages.push(assistantMessage);
    await this.saveMessage(assistantMessage);

    // Update session
    session.updatedAt = new Date();
    await this.updateSession(session);

    console.log(`[Q&A] Answer generated (${answerContent.answer.length} chars)`);

    return {
      session,
      answer: assistantMessage,
      suggestedQuestions: answerContent.suggestedQuestions,
    };
  }

  /**
   * Generate answer using GPT-4
   */
  private async generateAnswer(
    question: string,
    context: QAContext,
    previousMessages: QAMessage[]
  ): Promise<{ answer: string; sources?: QASource[]; suggestedQuestions?: string[] }> {
    const systemPrompt = `You are a helpful assistant answering questions about podcast content.
You have access to the following context from the content the user is asking about:

CONTENT TYPE: ${context.type}
TITLE: ${context.title}
${context.summary ? `SUMMARY: ${context.summary}` : ''}
${context.transcript ? `TRANSCRIPT EXCERPT: ${context.transcript.substring(0, 2000)}...` : ''}

GUIDELINES:
1. Answer questions based on the provided context
2. Be concise but comprehensive (2-4 sentences for simple questions, longer for complex ones)
3. If you can't answer from the context, say so and provide general knowledge if appropriate
4. Maintain a conversational, helpful tone
5. Suggest 2-3 follow-up questions the user might want to ask

Return a JSON object:
{
  "answer": "Your answer here...",
  "sources": [{"title": "Source name", "type": "transcript"}],
  "suggestedQuestions": ["Follow-up question 1?", "Follow-up question 2?"]
}

Return ONLY valid JSON.`;

    // Build conversation history
    const messages: Anthropic.MessageParam[] = [];

    // Add previous conversation (last 6 messages max)
    const recentMessages = previousMessages.slice(-6);
    for (const msg of recentMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      system: systemPrompt + '\n\nReturn ONLY valid JSON.',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseText = (response.content[0]?.type === 'text' ? response.content[0].text : '') || '{}';
    const parsed = JSON.parse(responseText);

    return {
      answer: parsed.answer || "I'm sorry, I couldn't generate an answer.",
      sources: parsed.sources?.map((s: { title: string; type?: string; url?: string; snippet?: string }) => ({
        id: `src-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        title: s.title,
        type: s.type || 'transcript',
        url: s.url,
        snippet: s.snippet,
      })),
      suggestedQuestions: parsed.suggestedQuestions || [],
    };
  }

  /**
   * Generate audio response
   */
  private async generateAudioAnswer(
    answerContent: { answer: string },
    sessionId: string,
    messageId: string
  ): Promise<{ audioUrl: string; durationSeconds: number }> {
    const voiceConfig: VoiceConfig = {
      host1: 'nova',
      host2: 'nova',
      model: 'tts-1',
      speed: 1.0,
    };

    const ttsResponse = await openaiTTS.synthesize({
      text: answerContent.answer,
      voice: voiceConfig.host1,
      speed: voiceConfig.speed,
    });

    // Upload
    const audioPath = `${sessionId}/${messageId}.mp3`;
    const audioUrl = await this.uploadAudio(ttsResponse.audio_buffer, audioPath);

    // Estimate duration (rough: 150 words per minute)
    const wordCount = answerContent.answer.split(/\s+/).length;
    const durationSeconds = Math.ceil((wordCount / 150) * 60);

    return { audioUrl, durationSeconds };
  }

  /**
   * Get context from original content
   */
  private async getContext(contextType: QAContextType, contextId: string): Promise<QAContext> {
    // In production, this would fetch actual content from the database
    // For now, return a mock context
    const contextTitles: Record<QAContextType, string> = {
      topic: 'Topic Episode',
      deep_dive: 'Deep Dive',
      live_station: 'Live Station',
      daily_brief: 'Daily Brief',
    };

    // Try to get actual context if database available
    if (this.supabase) {
      try {
        if (contextType === 'deep_dive') {
          const { data } = await this.supabase
            .from('deep_dive_episodes')
            .select('title, description, script')
            .eq('id', contextId)
            .single();

          if (data) {
            return {
              type: contextType,
              id: contextId,
              title: data.title,
              summary: data.description,
              transcript: data.script,
            };
          }
        }

        if (contextType === 'topic') {
          const { data } = await this.supabase
            .from('topic_episodes')
            .select('title, description, script')
            .eq('id', contextId)
            .single();

          if (data) {
            return {
              type: contextType,
              id: contextId,
              title: data.title,
              summary: data.description,
              transcript: data.script,
            };
          }
        }
      } catch (error) {
        console.error('[Q&A] Failed to fetch context:', error);
      }
    }

    return {
      type: contextType,
      id: contextId,
      title: contextTitles[contextType],
      summary: 'Content about this topic...',
    };
  }

  /**
   * Create a new Q&A session
   */
  private async createSession(
    userId: string,
    contextType: QAContextType,
    contextId: string
  ): Promise<QASession> {
    const session: QASession = {
      id: `qa-${userId.substring(0, 8)}-${Date.now()}`,
      userId,
      contextType,
      contextId,
      contextTitle: await this.getContextTitle(contextType, contextId),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Get context title
   */
  private async getContextTitle(contextType: QAContextType, contextId: string): Promise<string> {
    const context = await this.getContext(contextType, contextId);
    return context.title;
  }

  /**
   * Get existing session
   */
  async getSession(sessionId: string, userId: string): Promise<QASession | null> {
    if (!this.supabase) return null;

    const { data: sessionData, error: sessionError } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !sessionData) return null;

    // Get messages
    const { data: messagesData } = await this.supabase
      .from(this.MESSAGES_TABLE)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const session = this.mapDbToSession(sessionData);
    session.messages = (messagesData || []).map(this.mapDbToMessage);

    return session;
  }

  /**
   * Get user's Q&A session history
   */
  async getHistory(userId: string, limit: number = 20, offset: number = 0): Promise<QASessionHistoryResponse> {
    if (!this.supabase) {
      return { sessions: [], total: 0, hasMore: false };
    }

    // Get total count
    const { count } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get sessions
    const { data, error } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Failed to fetch Q&A history:', error);
      return { sessions: [], total: 0, hasMore: false };
    }

    // Get messages for each session (just the last message for preview)
    const sessions = await Promise.all(
      (data || []).map(async (record) => {
        const session = this.mapDbToSession(record);

        const { data: messagesData } = await this.supabase!
          .from(this.MESSAGES_TABLE)
          .select('*')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true });

        session.messages = (messagesData || []).map(this.mapDbToMessage);
        return session;
      })
    );

    return {
      sessions,
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Get session detail
   */
  async getSessionDetail(sessionId: string, userId: string): Promise<QASessionDetailResponse | null> {
    const session = await this.getSession(sessionId, userId);
    if (!session) return null;
    return { session };
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    if (!this.supabase) return false;

    // Delete messages first
    await this.supabase
      .from(this.MESSAGES_TABLE)
      .delete()
      .eq('session_id', sessionId);

    // Delete session
    const { error } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    return !error;
  }

  /**
   * Upload audio
   */
  private async uploadAudio(buffer: Buffer, path: string): Promise<string> {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    const { error } = await this.supabase.storage
      .from(this.BUCKET)
      .upload(path, buffer, {
        contentType: 'audio/mpeg',
        cacheControl: '86400',
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * Save session to database
   */
  private async saveSession(session: QASession): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: QASessionDbRecord = {
      id: session.id,
      user_id: session.userId,
      context_type: session.contextType,
      context_id: session.contextId,
      context_title: session.contextTitle,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
    };

    const { error } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[Q&A] Failed to save session:', error);
    }
  }

  /**
   * Update session
   */
  private async updateSession(session: QASession): Promise<void> {
    if (!this.supabase) return;

    const { error } = await this.supabase
      .from(this.SESSIONS_TABLE)
      .update({ updated_at: session.updatedAt.toISOString() })
      .eq('id', session.id);

    if (error) {
      console.error('[Q&A] Failed to update session:', error);
    }
  }

  /**
   * Save message to database
   */
  private async saveMessage(message: QAMessage): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: QAMessageDbRecord = {
      id: message.id,
      session_id: message.sessionId,
      role: message.role,
      content: message.content,
      audio_url: message.audioUrl,
      audio_path: message.audioPath,
      duration_seconds: message.durationSeconds,
      sources: message.sources ? JSON.stringify(message.sources) : undefined,
      created_at: message.createdAt.toISOString(),
    };

    const { error } = await this.supabase
      .from(this.MESSAGES_TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[Q&A] Failed to save message:', error);
    }
  }

  /**
   * Map database record to session
   */
  private mapDbToSession(data: Record<string, unknown>): QASession {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      contextType: data.context_type as QAContextType,
      contextId: data.context_id as string,
      contextTitle: data.context_title as string,
      messages: [],
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  /**
   * Map database record to message
   */
  private mapDbToMessage(data: Record<string, unknown>): QAMessage {
    return {
      id: data.id as string,
      sessionId: data.session_id as string,
      role: data.role as QAMessage['role'],
      content: data.content as string,
      audioUrl: data.audio_url as string | undefined,
      audioPath: data.audio_path as string | undefined,
      durationSeconds: data.duration_seconds as number | undefined,
      sources: data.sources ? JSON.parse(data.sources as string) : undefined,
      createdAt: new Date(data.created_at as string),
    };
  }
}

// Export singleton
export const qaGenerator = new QAGenerator();
