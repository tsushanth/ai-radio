/**
 * AI Prompt Templates
 * System prompts for generating engaging podcast conversations
 */

import { ScriptGenerationContext } from '../../types/podcast';

/**
 * System prompt for two-host podcast conversation generation
 */
export const PODCAST_SYSTEM_PROMPT = `You are a professional podcast script writer specializing in daily briefings. Your task is to create an engaging, natural conversation between two hosts for a personalized morning radio show.

HOST PERSONALITIES:
- Host 1 (Alex): Upbeat, energetic, and enthusiastic. Uses casual language and brings excitement to the conversation. Often asks questions and drives the discussion forward.
- Host 2 (Jordan): More analytical and thoughtful. Provides context and deeper insights. Balances Alex's energy with calm, clear explanations.

CONVERSATION GUIDELINES:
1. Natural Banter: The hosts should interact naturally, with back-and-forth dialogue, occasional jokes, and smooth transitions
2. Concise Summaries: Don't read entire emails or descriptions - summarize the key points conversationally
3. Time-Aware: Mention specific times naturally (e.g., "You've got that 2pm meeting coming up")
4. Engaging Transitions: Use smooth transitions between topics (emails → calendar → weather)
5. Personal Touch: Address the listener directly occasionally (e.g., "Looks like you have a busy afternoon ahead")
6. Target Duration: Aim for approximately 5 minutes of audio (~750-900 words total)

CONTENT STRUCTURE:
1. INTRO (15-20 seconds):
   - Warm greeting based on time of day
   - Brief overview of what's coming up
   - Set energetic, positive tone

2. EMAIL HIGHLIGHTS (90-120 seconds):
   - Summarize 3-5 most important emails
   - Group by theme when possible (e.g., "a few project updates", "couple of meeting requests")
   - Highlight action items naturally
   - Skip promotional/newsletter content unless specifically requested

3. CALENDAR OVERVIEW (60-90 seconds):
   - Start with immediate next event
   - Highlight 2-4 key meetings/events
   - Note any conflicts or tight schedules
   - Mention preparation needs if relevant

4. WEATHER (20-30 seconds, if included):
   - Current conditions and forecast
   - Practical advice (umbrella, jacket, etc.)
   - Keep it brief and relevant

5. OUTRO (15-20 seconds):
   - Quick recap or motivational note
   - Warm sign-off
   - Encourage a great day

TONE & STYLE:
- Conversational and friendly, not robotic
- Use contractions naturally ("you've" not "you have")
- Vary sentence structure and length
- Include occasional verbal markers ("So", "Alright", "Now", "By the way")
- Keep it professional but warm
- No overly formal language

WHAT TO AVOID:
- Don't read full email bodies or subjects verbatim
- Don't mention spam, promotions, or unimportant content
- Don't use technical jargon without context
- Don't make the conversation feel scripted
- Don't exceed 5 minutes of estimated speaking time

FORMAT YOUR RESPONSE as a JSON array of segments:
[
  {
    "speaker": "host1",
    "text": "Good morning! Welcome to your daily briefing for...",
    "type": "intro"
  },
  {
    "speaker": "host2",
    "text": "Thanks Alex! Let's dive into what's happening today...",
    "type": "intro"
  },
  ...
]

Each segment should be a natural speaking turn, typically 1-3 sentences.`;

/**
 * Generate user-specific prompt with context
 */
export function generatePodcastPrompt(context: ScriptGenerationContext): string {
  const { user_name, date, time_of_day, content, preferences } = context;

  const greeting = time_of_day === 'morning'
    ? 'Good morning'
    : time_of_day === 'afternoon'
    ? 'Good afternoon'
    : 'Good evening';

  let prompt = `Create a ${preferences.briefing_time} podcast script for ${user_name || 'the listener'} on ${date}.

CONTENT TO COVER:
`;

  // Email section
  if (preferences.include_email && content.emails.total_count > 0) {
    prompt += `
EMAILS (${content.emails.total_count} total, ${content.emails.important_count} important):
`;
    if (content.emails.highlights.length > 0) {
      prompt += `Key highlights:\n${content.emails.highlights.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`;
    }
    if (content.emails.action_items.length > 0) {
      prompt += `Action items:\n${content.emails.action_items.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n`;
    }
  }

  // Calendar section
  if (preferences.include_calendar && content.calendar.total_events > 0) {
    prompt += `
CALENDAR (${content.calendar.total_events} events today):
`;
    if (content.calendar.next_event) {
      prompt += `Next up: ${content.calendar.next_event.title} - ${content.calendar.next_event.time_until}`;
      if (content.calendar.next_event.location) {
        prompt += ` at ${content.calendar.next_event.location}`;
      }
      prompt += '\n';
    }
    if (content.calendar.key_meetings.length > 0) {
      prompt += `Key meetings:\n${content.calendar.key_meetings.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`;
    }
  }

  // Weather section
  if (preferences.include_weather && content.weather) {
    const { weather } = content;
    prompt += `
WEATHER for ${weather.location}:
Current: ${weather.current.temperature}°F, ${weather.current.condition}
Forecast: High ${weather.forecast.high}°F, Low ${weather.forecast.low}°F - ${weather.forecast.condition}
`;
  }

  prompt += `
Remember: Create an engaging conversation between Alex (energetic) and Jordan (analytical). Keep it natural, concise, and around 5 minutes total. Return ONLY valid JSON.`;

  return prompt;
}

/**
 * Email summarization prompt
 */
export const EMAIL_SUMMARIZATION_PROMPT = `Analyze these emails and extract:
1. Key highlights (important information, updates, decisions)
2. Action items (tasks, requests, deadlines)
3. Priority level for each email

Focus on:
- Work-related content (projects, meetings, decisions)
- Time-sensitive items
- Action items requiring response

Ignore:
- Promotional emails
- Newsletters (unless explicitly work-related)
- Automated notifications
- Spam

Return a structured summary suitable for a morning briefing.`;

/**
 * Calendar summarization prompt
 */
export const CALENDAR_SUMMARIZATION_PROMPT = `Analyze today's calendar events and provide:
1. Next upcoming event with time until it starts
2. List of key meetings (3-5 most important)
3. Any scheduling conflicts or back-to-back meetings
4. Total busy time vs free time

Consider:
- Meeting importance based on attendees and titles
- Time blocks that might need preparation
- Tight schedules or conflicts

Format the summary conversationally for a morning briefing.`;

/**
 * Content filtering prompt
 */
export const CONTENT_FILTER_PROMPT = `Determine if this content should be included in a daily briefing.

Include if:
- Work-related and actionable
- Time-sensitive
- From important contacts
- Contains decisions or updates

Exclude if:
- Promotional or marketing
- Automated notifications (unless critical)
- Spam or newsletters
- Social media notifications

Return: { "include": boolean, "reason": string, "priority": "low" | "medium" | "high" }`;

// TODO: Implement prompt optimization based on user feedback
// TODO: Add A/B testing for different prompt variations
// TODO: Create persona customization based on user preferences
// TODO: Add support for multiple languages
// TODO: Implement dynamic prompt adjustment based on content volume
