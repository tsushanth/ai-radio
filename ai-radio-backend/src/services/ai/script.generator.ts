/**
 * AI Script Generator
 * Generates engaging two-host podcast scripts using GPT-4
 */

import OpenAI from 'openai';
import { env } from '../../config/environment';
import {
  PODCAST_SYSTEM_PROMPT,
  generatePodcastPrompt,
} from './prompts';
import type {
  PodcastGenerationInput,
  ContentSummary,
  EmailSummary,
  CalendarSummary,
  ScriptGenerationContext,
} from '../../types/podcast';
import type { ScriptSegment, PodcastScript } from '../../types/database';
import type { EmailMessage } from '../../types/email';
import type { CalendarEvent } from '../../types/calendar';
import {
  filterForBriefing,
  determineEmailPriority,
  extractActionItems,
  summarizeEmail,
} from '../email/email.utils';
import {
  filterTodayEvents,
  filterTomorrowEvents,
  determineEventPriority,
  summarizeEvent,
  getNextEvent,
  getTimeDescription,
  EventPriority,
} from '../calendar/calendar.utils';

export class ScriptGeneratorService {
  private openai: OpenAI;
  private readonly DEFAULT_MODEL = 'gpt-4-turbo-preview';
  private readonly MAX_TOKENS = 4000;
  private readonly TEMPERATURE = 0.7;

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate podcast script from emails and calendar events
   */
  async generateScript(input: PodcastGenerationInput): Promise<PodcastScript> {
    try {
      // 1. Process content into summaries
      const contentSummary = this.processContent(input);

      // 2. Build generation context
      const context = this.buildContext(input, contentSummary);

      // 3. Generate script with GPT-4
      const segments = await this.generateWithGPT4(context);

      // 4. Validate and format script
      const script = this.formatScript(segments, input);

      return script;
    } catch (error) {
      console.error('Failed to generate podcast script:', error);
      throw this.createError('Failed to generate podcast script', error);
    }
  }

  /**
   * Process raw content into structured summaries
   */
  private processContent(input: PodcastGenerationInput): ContentSummary {
    const { emails, calendar_events, preferences } = input;

    // Process emails
    const emailSummary: EmailSummary = {
      total_count: 0,
      important_count: 0,
      highlights: [],
      action_items: [],
    };

    if (preferences.include_email && emails.length > 0) {
      // Filter for briefing (top 10 most relevant)
      const briefingEmails = filterForBriefing(emails, 10);
      emailSummary.total_count = briefingEmails.length;

      // Count important emails
      emailSummary.important_count = briefingEmails.filter(
        email => determineEmailPriority(email) === 'high'
      ).length;

      // Extract highlights (top 5)
      emailSummary.highlights = briefingEmails
        .slice(0, 5)
        .map(email => summarizeEmail(email));

      // Extract action items (unique, max 5)
      const allActionItems = briefingEmails.flatMap(email => extractActionItems(email));
      emailSummary.action_items = [...new Set(allActionItems)].slice(0, 5);
    }

    // Process calendar
    const calendarSummary: CalendarSummary = {
      total_events: 0,
      next_event: undefined,
      busy_periods: [],
      key_meetings: [],
    };

    if (preferences.include_calendar && calendar_events.length > 0) {
      const todayEvents = filterTodayEvents(calendar_events);
      calendarSummary.total_events = todayEvents.length;

      // Get next event
      const nextEvent = getNextEvent(todayEvents);
      if (nextEvent) {
        calendarSummary.next_event = {
          title: nextEvent.title,
          time_until: getTimeDescription(nextEvent.start_time),
          location: nextEvent.location || undefined,
        };
      }

      // Get key meetings (high priority events)
      const keyMeetings = todayEvents
        .filter(event => determineEventPriority(event) === EventPriority.HIGH)
        .slice(0, 4)
        .map(event => summarizeEvent(event));
      calendarSummary.key_meetings = keyMeetings;

      // Generate busy period descriptions
      if (todayEvents.length >= 5) {
        calendarSummary.busy_periods.push('Heavy meeting schedule today');
      } else if (todayEvents.length >= 3) {
        calendarSummary.busy_periods.push('Moderately busy day');
      }
    }

    return {
      emails: emailSummary,
      calendar: calendarSummary,
    };
  }

  /**
   * Build script generation context
   */
  private buildContext(
    input: PodcastGenerationInput,
    contentSummary: ContentSummary
  ): ScriptGenerationContext {
    const { user_id, date, preferences } = input;

    // Determine time of day
    const hour = new Date().getHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening';
    if (hour < 12) {
      timeOfDay = 'morning';
    } else if (hour < 17) {
      timeOfDay = 'afternoon';
    } else {
      timeOfDay = 'evening';
    }

    return {
      user_name: user_id.split('@')[0], // Extract name from email
      date,
      time_of_day: timeOfDay,
      content: contentSummary,
      preferences,
    };
  }

  /**
   * Generate script using GPT-4
   */
  private async generateWithGPT4(context: ScriptGenerationContext): Promise<ScriptSegment[]> {
    try {
      const userPrompt = generatePodcastPrompt(context);

      const completion = await this.openai.chat.completions.create({
        model: this.DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content: PODCAST_SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: this.MAX_TOKENS,
        temperature: this.TEMPERATURE,
        response_format: { type: 'json_object' },
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from GPT-4');
      }

      // Parse JSON response with better error handling
      let parsed: any;
      try {
        parsed = JSON.parse(response);
      } catch (parseError) {
        console.error('Failed to parse GPT-4 response as JSON:', response.substring(0, 500));
        throw new Error('GPT-4 returned invalid JSON');
      }

      // Handle multiple possible response formats from GPT-4
      let segments: ScriptSegment[];
      if (Array.isArray(parsed)) {
        segments = parsed;
      } else if (parsed.segments && Array.isArray(parsed.segments)) {
        segments = parsed.segments;
      } else if (parsed.script && Array.isArray(parsed.script)) {
        segments = parsed.script;
      } else if (parsed.dialogue && Array.isArray(parsed.dialogue)) {
        segments = parsed.dialogue;
      } else if (parsed.conversation && Array.isArray(parsed.conversation)) {
        segments = parsed.conversation;
      } else if (parsed.podcast && Array.isArray(parsed.podcast)) {
        segments = parsed.podcast;
      } else if (parsed.content && Array.isArray(parsed.content)) {
        segments = parsed.content;
      } else {
        // Try to find any array property in the response
        const arrayProps = Object.keys(parsed).filter(key => Array.isArray(parsed[key]));
        if (arrayProps.length > 0) {
          console.log(`Found array property '${arrayProps[0]}' in GPT-4 response, using it`);
          segments = parsed[arrayProps[0]];
        } else if (parsed.speaker && parsed.text) {
          // GPT-4 returned a single segment object instead of an array
          // This happens sometimes - wrap it in an array
          console.log('GPT-4 returned single segment object, wrapping in array');
          segments = [parsed];
        } else if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          // Check if it's an object with numeric keys (pseudo-array)
          const keys = Object.keys(parsed);
          const isNumericKeys = keys.every(k => !isNaN(parseInt(k)));
          if (isNumericKeys) {
            console.log('GPT-4 returned object with numeric keys, converting to array');
            segments = keys.sort((a, b) => parseInt(a) - parseInt(b)).map(k => parsed[k]);
          } else {
            // Last resort: check if any nested object looks like a segment
            const potentialSegments = Object.values(parsed).filter(
              (v: any) => v && typeof v === 'object' && v.text && (v.speaker || v.host)
            );
            if (potentialSegments.length > 0) {
              console.log(`Found ${potentialSegments.length} potential segments in nested objects`);
              segments = potentialSegments as ScriptSegment[];
            } else {
              console.error('Invalid GPT-4 response structure:', JSON.stringify(parsed).substring(0, 500));
              throw new Error('Invalid response format from GPT-4 - no valid segment array found');
            }
          }
        } else {
          console.error('Invalid GPT-4 response structure:', JSON.stringify(parsed).substring(0, 500));
          throw new Error('Invalid response format from GPT-4 - no valid segment array found');
        }
      }

      // Validate segments
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('Generated script has no segments');
      }

      // If we got too few segments, log a warning but continue
      // The fallback will be triggered later if script validation fails
      if (segments.length < 5) {
        console.warn(`GPT-4 returned only ${segments.length} segments (expected at least 5), will use fallback if needed`);
      }

      // Normalize and validate each segment with flexible field mapping
      // Cast to any[] since GPT-4 may return various field names
      const validTypes = ['intro', 'email', 'calendar', 'news', 'weather', 'outro', 'pause'];
      const rawSegments = segments as any[];
      segments = rawSegments.map((segment, index) => {
        // Handle various speaker field names
        const speaker = segment.speaker || segment.host || segment.voice || segment.character;
        // Handle various text field names
        const text = segment.text || segment.content || segment.dialogue || segment.line || segment.message;
        // Handle various type field names
        let type = segment.type || segment.segment_type || segment.category || segment.section || 'email';

        // Normalize type to valid values
        if (!validTypes.includes(type)) {
          // Map common variations
          const typeMap: Record<string, string> = {
            'introduction': 'intro',
            'opening': 'intro',
            'greeting': 'intro',
            'emails': 'email',
            'mail': 'email',
            'message': 'email',
            'messages': 'email',
            'events': 'calendar',
            'schedule': 'calendar',
            'meeting': 'calendar',
            'meetings': 'calendar',
            'closing': 'outro',
            'goodbye': 'outro',
            'farewell': 'outro',
            'end': 'outro',
            'topic': 'news',
            'discussion': 'news',
            'general': 'news',
            'forecast': 'weather',
          };
          type = typeMap[type.toLowerCase()] || 'email'; // Default to 'email' for unknown types
        }

        // Normalize speaker values
        let normalizedSpeaker = speaker;
        if (speaker) {
          const speakerLower = speaker.toString().toLowerCase();
          if (speakerLower.includes('alex') || speakerLower === 'host1' || speakerLower === '1' || speakerLower === 'a') {
            normalizedSpeaker = 'host1';
          } else if (speakerLower.includes('jordan') || speakerLower === 'host2' || speakerLower === '2' || speakerLower === 'b') {
            normalizedSpeaker = 'host2';
          }
        }

        if (!normalizedSpeaker || !text) {
          console.warn(`Segment ${index} missing required fields, speaker: ${speaker}, text length: ${text?.length || 0}`);
          // Try to salvage the segment
          if (text) {
            normalizedSpeaker = index % 2 === 0 ? 'host1' : 'host2'; // Alternate hosts
          } else {
            throw new Error(`Invalid segment at index ${index}: missing speaker or text`);
          }
        }

        return {
          speaker: normalizedSpeaker as 'host1' | 'host2',
          text: text.toString().trim(),
          type: type as ScriptSegment['type'],
        };
      });

      // Filter out any segments with empty text
      segments = segments.filter(s => s.text && s.text.length > 0);

      if (segments.length === 0) {
        throw new Error('Generated script has no valid segments after normalization');
      }

      return segments;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw this.createError(`OpenAI API error: ${error.message}`, error);
      }
      throw this.createError('Failed to generate script with GPT-4', error);
    }
  }

  /**
   * Format and validate script
   */
  private formatScript(segments: ScriptSegment[], input: PodcastGenerationInput): PodcastScript {
    // Add sequence numbers to segments
    const numberedSegments = segments.map((segment, index) => ({
      ...segment,
      sequence: index + 1,
    }));

    // Calculate estimated duration (average speaking rate: 150 words per minute)
    const totalWords = segments.reduce((sum, segment) => {
      return sum + segment.text.split(/\s+/).length;
    }, 0);
    const estimatedDuration = Math.ceil((totalWords / 150) * 60); // Convert to seconds

    return {
      segments: numberedSegments,
      generated_at: new Date().toISOString(),
      total_segments: segments.length,
      estimated_duration_seconds: estimatedDuration,
      metadata: {
        model: this.DEFAULT_MODEL,
        temperature: this.TEMPERATURE,
        total_words: totalWords,
        email_count: input.emails.length,
        calendar_event_count: input.calendar_events.length,
      },
    };
  }

  /**
   * Generate script with retry logic and fallback
   */
  async generateScriptWithRetry(
    input: PodcastGenerationInput,
    maxRetries: number = 3
  ): Promise<PodcastScript> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.generateScript(input);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Script generation attempt ${attempt} failed:`, lastError.message);

        // Don't retry on client errors (4xx)
        if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500) {
          // For 4xx errors, try fallback instead of throwing
          console.warn('OpenAI client error, attempting fallback script generation');
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    // All retries failed - generate a fallback script
    console.warn('All script generation attempts failed, using fallback script');
    return this.generateFallbackScript(input);
  }

  /**
   * Generate a fallback script when AI generation fails
   * Creates a simple but functional podcast script from available content
   */
  private generateFallbackScript(input: PodcastGenerationInput): PodcastScript {
    const { emails, calendar_events, user_id, date, preferences } = input;
    const userName = user_id.split('@')[0];

    // Determine time of day for greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const segments: ScriptSegment[] = [];

    // Intro segment
    segments.push({
      speaker: 'host1',
      text: `${greeting}! Welcome to your daily briefing for ${date}. I'm Alex, and I'm here with Jordan to catch you up on what's happening.`,
      type: 'intro',
    });

    segments.push({
      speaker: 'host2',
      text: `Hey there, ${userName}! Let's dive into what you need to know today.`,
      type: 'intro',
    });

    // Process emails if available
    if (preferences.include_email && emails.length > 0) {
      // Get top emails (prioritize unread)
      const topEmails = emails
        .sort((a, b) => {
          if (a.is_unread && !b.is_unread) return -1;
          if (!a.is_unread && b.is_unread) return 1;
          if (a.is_important && !b.is_important) return -1;
          if (!a.is_important && b.is_important) return 1;
          return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
        })
        .slice(0, 5);

      const unreadCount = emails.filter(e => e.is_unread).length;
      const readCount = emails.length - unreadCount;

      segments.push({
        speaker: 'host1',
        text: `Alright, let's look at your inbox. You've got ${emails.length} emails to catch up on - ${unreadCount} unread and ${readCount} that you've already seen.`,
        type: 'email',
      });

      // Add email highlights
      topEmails.forEach((email, index) => {
        const speaker = index % 2 === 0 ? 'host2' : 'host1';
        const unreadTag = email.is_unread ? '' : 'From your read emails, ';
        const importantTag = email.is_important ? "and it looks important - " : '';

        segments.push({
          speaker: speaker as 'host1' | 'host2',
          text: `${unreadTag}You have an email from ${email.from.split('@')[0]} about "${email.subject}". ${importantTag}${email.snippet.substring(0, 100)}...`,
          type: 'email',
        });
      });

      segments.push({
        speaker: 'host1',
        text: `That covers the key emails. Make sure to check the ${unreadCount > 0 ? 'unread ones' : 'important ones'} when you get a chance!`,
        type: 'email',
      });
    } else {
      segments.push({
        speaker: 'host2',
        text: `Your inbox is looking pretty clear today - no major emails to report.`,
        type: 'email',
      });
    }

    // Process calendar if available
    if (preferences.include_calendar && calendar_events.length > 0) {
      segments.push({
        speaker: 'host2',
        text: `Now let's look at your calendar. You've got ${calendar_events.length} events lined up.`,
        type: 'calendar',
      });

      calendar_events.slice(0, 3).forEach((event, index) => {
        const speaker = index % 2 === 0 ? 'host1' : 'host2';
        segments.push({
          speaker: speaker as 'host1' | 'host2',
          text: `Coming up: ${event.title}${event.location ? ` at ${event.location}` : ''}.`,
          type: 'calendar',
        });
      });
    }

    // Outro
    segments.push({
      speaker: 'host2',
      text: `That's your briefing for today! Stay productive and have a great day ahead.`,
      type: 'outro',
    });

    segments.push({
      speaker: 'host1',
      text: `Thanks for listening! We'll catch you next time. Take care!`,
      type: 'outro',
    });

    // Calculate duration
    const totalWords = segments.reduce((sum, segment) => {
      return sum + segment.text.split(/\s+/).length;
    }, 0);
    const estimatedDuration = Math.ceil((totalWords / 150) * 60);

    return {
      segments: segments.map((segment, index) => ({
        ...segment,
        sequence: index + 1,
      })),
      generated_at: new Date().toISOString(),
      total_segments: segments.length,
      estimated_duration_seconds: estimatedDuration,
      metadata: {
        model: 'fallback',
        temperature: 0,
        total_words: totalWords,
        email_count: emails.length,
        calendar_event_count: calendar_events.length,
        fallback: true,
      },
    };
  }

  /**
   * Validate script quality
   */
  validateScript(script: PodcastScript): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check minimum segments
    if (script.total_segments < 5) {
      issues.push('Script has too few segments (minimum 5)');
    }

    // Check maximum duration (8 minutes)
    if (script.estimated_duration_seconds > 480) {
      issues.push('Script exceeds maximum duration of 8 minutes');
    }

    // Check minimum duration (3 minutes)
    if (script.estimated_duration_seconds < 180) {
      issues.push('Script is too short (minimum 3 minutes)');
    }

    // Check for both hosts
    const host1Segments = script.segments.filter(s => s.speaker === 'host1').length;
    const host2Segments = script.segments.filter(s => s.speaker === 'host2').length;

    if (host1Segments === 0) {
      issues.push('Script missing host1 segments');
    }
    if (host2Segments === 0) {
      issues.push('Script missing host2 segments');
    }

    // Check for required segment types
    const hasIntro = script.segments.some(s => s.type === 'intro');
    const hasOutro = script.segments.some(s => s.type === 'outro');

    if (!hasIntro) {
      issues.push('Script missing intro');
    }
    if (!hasOutro) {
      issues.push('Script missing outro');
    }

    // Check for empty segments
    const emptySegments = script.segments.filter(s => !s.text || s.text.trim().length === 0);
    if (emptySegments.length > 0) {
      issues.push(`Script has ${emptySegments.length} empty segments`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Generate a quick summary script (for testing)
   */
  async generateQuickSummary(
    emails: EmailMessage[],
    events: CalendarEvent[]
  ): Promise<string> {
    const emailCount = emails.length;
    const eventCount = events.length;
    const importantEmails = emails.filter(e => e.is_important).length;
    const nextEvent = getNextEvent(events);

    let summary = `Daily Briefing Summary:\n\n`;
    summary += `📧 Emails: ${emailCount} total (${importantEmails} important)\n`;
    summary += `📅 Events: ${eventCount} on calendar\n`;

    if (nextEvent) {
      const timeDesc = getTimeDescription(nextEvent.start_time);
      summary += `⏰ Next: ${nextEvent.title} ${timeDesc}\n`;
    }

    return summary;
  }

  /**
   * Estimate token usage for a request
   */
  estimateTokenUsage(input: PodcastGenerationInput): {
    estimated_tokens: number;
    estimated_cost_usd: number;
  } {
    // Rough estimation: 1 token ≈ 4 characters
    const systemPromptTokens = Math.ceil(PODCAST_SYSTEM_PROMPT.length / 4);

    // Estimate user prompt size
    const emailContent = input.emails.length * 100; // ~100 chars per email summary
    const calendarContent = input.calendar_events.length * 80; // ~80 chars per event
    const userPromptChars = 500 + emailContent + calendarContent;
    const userPromptTokens = Math.ceil(userPromptChars / 4);

    const inputTokens = systemPromptTokens + userPromptTokens;
    const outputTokens = this.MAX_TOKENS;
    const totalTokens = inputTokens + outputTokens;

    // GPT-4 Turbo pricing (as of Jan 2024)
    const inputCostPer1k = 0.01; // $0.01 per 1K input tokens
    const outputCostPer1k = 0.03; // $0.03 per 1K output tokens

    const estimatedCost =
      (inputTokens / 1000) * inputCostPer1k +
      (outputTokens / 1000) * outputCostPer1k;

    return {
      estimated_tokens: totalTokens,
      estimated_cost_usd: parseFloat(estimatedCost.toFixed(4)),
    };
  }

  /**
   * Get model information
   */
  getModelInfo(): {
    model: string;
    max_tokens: number;
    temperature: number;
  } {
    return {
      model: this.DEFAULT_MODEL,
      max_tokens: this.MAX_TOKENS,
      temperature: this.TEMPERATURE,
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create standardized error
   */
  private createError(message: string, originalError?: unknown): Error {
    const error = new Error(message);

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    return error;
  }
}

// Export singleton instance
export const scriptGenerator = new ScriptGeneratorService();

// Export class for testing
export default ScriptGeneratorService;
