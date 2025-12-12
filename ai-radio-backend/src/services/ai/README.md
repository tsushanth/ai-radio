# AI Script Generation Services

GPT-4 powered script generation for engaging two-host podcast conversations.

## Files

### `script.generator.ts`
Complete GPT-4 integration for generating natural podcast scripts from emails and calendar events.

**Features:**
- ✅ Content processing and summarization
- ✅ GPT-4 powered script generation
- ✅ Two-host conversation (Alex & Jordan)
- ✅ Natural dialogue with smooth transitions
- ✅ Automatic retry logic with exponential backoff
- ✅ Script validation and quality checks
- ✅ Token usage estimation and cost calculation
- ✅ Configurable duration targeting (~5 minutes)

**Key Methods:**
```typescript
// Generate full podcast script
const script = await scriptGenerator.generateScript({
  user_id: 'user@example.com',
  emails: emailMessages,
  calendar_events: calendarEvents,
  date: '2024-01-15',
  preferences: userPreferences
});

// Generate with retry
const script = await scriptGenerator.generateScriptWithRetry(input, 3);

// Validate generated script
const validation = scriptGenerator.validateScript(script);
if (!validation.valid) {
  console.error('Issues:', validation.issues);
}

// Estimate costs
const estimate = scriptGenerator.estimateTokenUsage(input);
console.log(`Estimated cost: $${estimate.estimated_cost_usd}`);
```

### `script.utils.ts`
Comprehensive utilities for script formatting, analysis, and manipulation.

**Features:**
- ✅ Multiple format outputs (display, text, SRT)
- ✅ Detailed script statistics
- ✅ Speaker balance analysis
- ✅ Segment merging and optimization
- ✅ Duration-based truncation
- ✅ Pause marker injection
- ✅ Structure validation
- ✅ Preview generation

**Key Functions:**
```typescript
import {
  formatScriptForDisplay,
  getScriptStatistics,
  hasBalancedSpeakers,
  extractSpeakerText,
  validateScriptStructure,
} from './script.utils';

// Format for display
const displayText = formatScriptForDisplay(script);
console.log(displayText);

// Get statistics
const stats = getScriptStatistics(script);
console.log(`Total words: ${stats.total_words}`);
console.log(`Duration: ${stats.estimated_duration}`);

// Check speaker balance
const balance = hasBalancedSpeakers(script);
console.log(`Balanced: ${balance.balanced}`);

// Extract text for TTS
const host1Text = extractSpeakerText(script, 'host1');
const host2Text = extractSpeakerText(script, 'host2');

// Validate structure
const validation = validateScriptStructure(script);
console.log(`Valid: ${validation.valid}`);
console.log(`Warnings: ${validation.warnings.join(', ')}`);
```

### `prompts.ts`
System prompts and context builders for GPT-4.

**Features:**
- ✅ Professional system prompt with host personalities
- ✅ Content structure guidelines
- ✅ Tone and style instructions
- ✅ Dynamic user prompt generation
- ✅ Context-aware greeting selection
- ✅ JSON response formatting

## Script Generation Pipeline

```
┌─────────────────────────────────────────────────────────┐
│           Script Generation Pipeline                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Receive Input (emails + calendar + preferences)     │
│           ↓                                              │
│  2. Process Content                                      │
│      - Filter emails (top 10 relevant)                   │
│      - Extract action items                              │
│      - Identify today's events                           │
│      - Find next event                                   │
│      - Determine priorities                              │
│           ↓                                              │
│  3. Build Content Summary                                │
│      - Email summary (count, highlights, actions)        │
│      - Calendar summary (events, next, key meetings)     │
│      - Weather data (if enabled)                         │
│           ↓                                              │
│  4. Generate Context                                     │
│      - Extract user name                                 │
│      - Determine time of day                             │
│      - Apply user preferences                            │
│           ↓                                              │
│  5. Call GPT-4                                           │
│      - System prompt (host personalities)                │
│      - User prompt (specific content)                    │
│      - JSON response format                              │
│      - Temperature: 0.7 for creativity                   │
│           ↓                                              │
│  6. Parse & Validate Response                            │
│      - Parse JSON segments                               │
│      - Validate required fields                          │
│      - Check segment count                               │
│           ↓                                              │
│  7. Format Script                                        │
│      - Add sequence numbers                              │
│      - Calculate duration                                │
│      - Add metadata                                      │
│           ↓                                              │
│  8. Return PodcastScript                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```typescript
// 1. Prepare input data
const input: PodcastGenerationInput = {
  user_id: 'user@example.com',
  emails: await gmailService.fetchEmails(userId, options),
  calendar_events: await googleCalendarService.fetchTodayAndTomorrowEvents(userId),
  date: new Date().toISOString().split('T')[0],
  preferences: {
    briefing_time: '07:00',
    topics: ['work', 'meetings'],
    voice_host1: 'nova',
    voice_host2: 'onyx',
    include_weather: true,
    include_calendar: true,
    include_email: true,
  }
};

// 2. Generate script
const script = await scriptGenerator.generateScript(input);

// 3. Validate quality
const validation = scriptGenerator.validateScript(script);
if (!validation.valid) {
  console.error('Quality issues:', validation.issues);
}

// 4. Get statistics
const stats = getScriptStatistics(script);
console.log(`Generated ${stats.total_segments} segments (${stats.total_words} words)`);

// 5. Extract speaker text for TTS
const host1Lines = extractSpeakerText(script, 'host1');
const host2Lines = extractSpeakerText(script, 'host2');

// 6. Generate audio for each line
// ... TTS processing
```

## Host Personalities

### Host 1 (Alex)
- **Style**: Upbeat, energetic, enthusiastic
- **Language**: Casual, conversational
- **Role**: Drives discussion, asks questions, brings excitement
- **Characteristics**:
  - Uses contractions naturally
  - Shorter, punchier sentences
  - Occasional exclamations
  - Keeps energy high

**Example lines:**
- "Good morning! Let's see what's on deck for today!"
- "Oh wow, looks like you've got a packed schedule!"
- "That sounds important - better prep for that one!"

### Host 2 (Jordan)
- **Style**: Analytical, thoughtful, calm
- **Language**: Clear, informative
- **Role**: Provides context, deeper insights, balances energy
- **Characteristics**:
  - More measured delivery
  - Explains implications
  - Offers practical advice
  - Maintains professional tone

**Example lines:**
- "Let me walk you through the key meetings."
- "Given the timing, you'll want to leave a buffer between those."
- "Here's what you need to know about today's schedule."

## Script Structure

### 1. Intro (15-20 seconds)
```typescript
{
  speaker: "host1",
  text: "Good morning! Welcome to your daily briefing for Monday, January 15th!",
  type: "intro",
  sequence: 1
}
{
  speaker: "host2",
  text: "Thanks Alex! Let's dive into what's happening today.",
  type: "intro",
  sequence: 2
}
```

### 2. Email Highlights (90-120 seconds)
```typescript
{
  speaker: "host1",
  text: "Alright, let's start with your inbox. You've got 12 emails, with 3 that need attention.",
  type: "email",
  sequence: 3
}
{
  speaker: "host2",
  text: "The most important one is from Sarah about the project deadline...",
  type: "email",
  sequence: 4
}
```

### 3. Calendar Overview (60-90 seconds)
```typescript
{
  speaker: "host1",
  text: "Now, let's look at your schedule. You've got 5 meetings today.",
  type: "calendar",
  sequence: 5
}
{
  speaker: "host2",
  text: "Your first one is the team standup in about 30 minutes at 9 AM...",
  type: "calendar",
  sequence: 6
}
```

### 4. Weather (20-30 seconds, optional)
```typescript
{
  speaker: "host1",
  text: "Quick weather check - it's 45 degrees and cloudy right now.",
  type: "weather",
  sequence: 7
}
{
  speaker: "host2",
  text: "The forecast calls for rain this afternoon, so grab an umbrella!",
  type: "weather",
  sequence: 8
}
```

### 5. Outro (15-20 seconds)
```typescript
{
  speaker: "host1",
  text: "That's your briefing for today! Stay organized and make it a great one.",
  type: "outro",
  sequence: 9
}
{
  speaker: "host2",
  text: "Have a productive day!",
  type: "outro",
  sequence: 10
}
```

## GPT-4 Configuration

### Model Settings
- **Model**: `gpt-4-turbo-preview`
- **Max Tokens**: 4000
- **Temperature**: 0.7 (balanced creativity)
- **Response Format**: JSON object

### Token Usage Estimation

| Component | Tokens (approx) |
|-----------|----------------|
| System prompt | ~750 |
| User prompt (base) | ~125 |
| Email content (per email) | ~25 |
| Calendar content (per event) | ~20 |
| Output (script) | ~2000-3000 |

**Example calculation:**
```typescript
// Input: 10 emails + 5 events
const estimate = scriptGenerator.estimateTokenUsage(input);
// {
//   estimated_tokens: 4375,
//   estimated_cost_usd: 0.1081  // ~$0.11
// }
```

### Cost Estimation (GPT-4 Turbo Pricing)
- **Input**: $0.01 per 1K tokens
- **Output**: $0.03 per 1K tokens
- **Average script**: $0.08 - $0.15
- **Daily usage**: ~$2.40 - $4.50 per month per user

## Usage Examples

### Basic Script Generation

```typescript
import { scriptGenerator } from './services/ai/script.generator';
import { gmailService } from './services/email/gmail.service';
import { googleCalendarService } from './services/calendar/calendar.service';

async function generateDailyBriefing(userId: string) {
  // Fetch data
  const emails = await gmailService.fetchEmails(userId, {
    max_results: 50,
    since_hours: 24,
  });

  const events = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

  // Generate script
  const script = await scriptGenerator.generateScript({
    user_id: userId,
    emails,
    calendar_events: events,
    date: new Date().toISOString().split('T')[0],
    preferences: {
      briefing_time: '07:00',
      topics: ['work'],
      voice_host1: 'nova',
      voice_host2: 'onyx',
      include_weather: true,
      include_calendar: true,
      include_email: true,
    },
  });

  console.log(`Generated ${script.total_segments} segments`);
  console.log(`Duration: ${script.estimated_duration_seconds}s`);

  return script;
}
```

### Script Generation with Retry

```typescript
async function generateWithRetry(input: PodcastGenerationInput) {
  try {
    const script = await scriptGenerator.generateScriptWithRetry(input, 3);

    // Validate quality
    const validation = scriptGenerator.validateScript(script);

    if (!validation.valid) {
      console.error('Script quality issues:', validation.issues);
      // Retry or handle issues
    }

    return script;
  } catch (error) {
    console.error('Script generation failed:', error);
    throw error;
  }
}
```

### Format Script for Display

```typescript
import { formatScriptForDisplay, getScriptStatistics } from './script.utils';

const script = await scriptGenerator.generateScript(input);

// Display formatted script
console.log(formatScriptForDisplay(script));

// Get detailed statistics
const stats = getScriptStatistics(script);
console.log(`
Total Segments: ${stats.total_segments}
Total Words: ${stats.total_words}
Host 1 Segments: ${stats.host1_segments}
Host 2 Segments: ${stats.host2_segments}
Duration: ${stats.estimated_duration}
Average Segment Length: ${stats.average_segment_length} words
`);
```

### Extract Text for TTS

```typescript
import { extractSpeakerText } from './script.utils';

const script = await scriptGenerator.generateScript(input);

// Get all lines for each host
const host1Lines = extractSpeakerText(script, 'host1');
const host2Lines = extractSpeakerText(script, 'host2');

// Process with TTS
for (const line of host1Lines) {
  const audio = await ttsService.synthesize({
    text: line.text,
    voice: 'nova', // OpenAI TTS voice
  });
  // Save or stream audio
}
```

### Check Speaker Balance

```typescript
import { hasBalancedSpeakers } from './script.utils';

const script = await scriptGenerator.generateScript(input);
const balance = hasBalancedSpeakers(script);

if (!balance.balanced) {
  console.warn(`Unbalanced script: ${balance.host1_percentage}% vs ${balance.host2_percentage}%`);
  console.warn(`Severity: ${balance.imbalance_severity}`);

  // Optionally regenerate with adjusted prompt
}
```

### Truncate to Target Duration

```typescript
import { truncateScriptToDuration } from './script.utils';

let script = await scriptGenerator.generateScript(input);

// Target 5 minutes (300 seconds)
if (script.estimated_duration_seconds > 300) {
  script = truncateScriptToDuration(script, 300);
  console.log(`Truncated to ${script.estimated_duration_seconds}s`);
}
```

### Generate SRT Subtitles

```typescript
import { formatScriptAsSRT } from './script.utils';

const script = await scriptGenerator.generateScript(input);
const srtContent = formatScriptAsSRT(script);

// Save to file
fs.writeFileSync('podcast.srt', srtContent);
```

## Error Handling

### OpenAI API Errors

```typescript
try {
  const script = await scriptGenerator.generateScript(input);
} catch (error) {
  if (error.message.includes('OpenAI API error')) {
    // Handle API errors (rate limits, invalid key, etc.)
    console.error('API Error:', error.message);
  } else if (error.message.includes('No response from GPT-4')) {
    // Handle empty response
    console.error('Empty response from GPT-4');
  } else if (error.message.includes('Invalid response format')) {
    // Handle parsing errors
    console.error('Failed to parse GPT-4 response');
  }
}
```

### Retry Logic

```typescript
// Automatic retry with exponential backoff
const script = await scriptGenerator.generateScriptWithRetry(input, 3);

// Retry delays: 1s, 2s, 4s
// Skips retry on 4xx client errors
```

### Validation Errors

```typescript
const validation = scriptGenerator.validateScript(script);

if (!validation.valid) {
  validation.issues.forEach(issue => {
    if (issue.includes('too few segments')) {
      // Handle short script
    } else if (issue.includes('exceeds maximum duration')) {
      // Truncate script
      script = truncateScriptToDuration(script, 480); // 8 min max
    } else if (issue.includes('missing host')) {
      // Regenerate script
    }
  });
}
```

## Best Practices

### 1. Content Preparation
```typescript
// Filter emails before sending to GPT-4
const relevantEmails = filterForBriefing(emails, 10);

// Filter events to today and tomorrow only
const relevantEvents = filterTodayAndTomorrowEvents(events);
```

### 2. Token Usage Optimization
```typescript
// Estimate before generation
const estimate = scriptGenerator.estimateTokenUsage(input);
console.log(`Estimated cost: $${estimate.estimated_cost_usd}`);

// Limit content if cost is high
if (estimate.estimated_cost_usd > 0.20) {
  input.emails = input.emails.slice(0, 5); // Reduce emails
}
```

### 3. Quality Validation
```typescript
// Always validate generated scripts
const validation = scriptGenerator.validateScript(script);

if (!validation.valid) {
  // Log issues for monitoring
  console.error('Script quality issues:', validation.issues);

  // Retry or use fallback
  script = await generateFallbackScript(input);
}
```

### 4. Speaker Balance
```typescript
const balance = hasBalancedSpeakers(script);

if (balance.imbalance_severity === 'severe') {
  // Warn or regenerate
  console.warn('Severe speaker imbalance detected');
}
```

### 5. Duration Management
```typescript
// Check duration
if (script.estimated_duration_seconds > 360) { // 6 minutes
  // Truncate to 5 minutes
  script = truncateScriptToDuration(script, 300);
}
```

## Performance Considerations

### Response Times
- **Average**: 8-15 seconds
- **With retry**: 20-45 seconds (worst case)
- **Factors**: Content length, API load, network

### Optimization Tips

1. **Cache scripts**: Cache generated scripts for repeated requests
   ```typescript
   const cacheKey = `script:${userId}:${date}`;
   const cached = await redis.get(cacheKey);
   if (cached) return JSON.parse(cached);
   ```

2. **Batch processing**: Generate scripts during off-peak hours
   ```typescript
   // Generate at 6 AM for 7 AM delivery
   cron.schedule('0 6 * * *', generateDailyScripts);
   ```

3. **Parallel generation**: Generate for multiple users concurrently
   ```typescript
   const scripts = await Promise.all(
     users.map(user => scriptGenerator.generateScript(user.input))
   );
   ```

4. **Fallback scripts**: Have pre-generated templates for failures
   ```typescript
   if (scriptGenerationFails) {
     return generateTemplateScript(user);
   }
   ```

## Testing

### Unit Testing

```typescript
import { scriptGenerator } from './script.generator';

describe('ScriptGenerator', () => {
  it('should generate valid script', async () => {
    const script = await scriptGenerator.generateScript(mockInput);

    expect(script.total_segments).toBeGreaterThan(5);
    expect(script.segments[0].type).toBe('intro');
    expect(script.segments[script.segments.length - 1].type).toBe('outro');
  });

  it('should validate script quality', () => {
    const validation = scriptGenerator.validateScript(mockScript);
    expect(validation.valid).toBe(true);
  });
});
```

### Integration Testing

```typescript
// Test full pipeline
const input = createTestInput();
const script = await scriptGenerator.generateScript(input);
const validation = scriptGenerator.validateScript(script);

assert(validation.valid, 'Script should be valid');
assert(script.estimated_duration_seconds < 420, 'Script should be under 7 minutes');
```

## Monitoring

### Key Metrics to Track
- Script generation success rate
- Average generation time
- Token usage per script
- Daily cost per user
- Quality validation failures
- Speaker balance distribution
- Average script duration

### Logging Example
```typescript
console.log({
  event: 'script_generated',
  user_id: input.user_id,
  segments: script.total_segments,
  duration: script.estimated_duration_seconds,
  tokens: script.metadata?.total_words,
  host1_pct: balance.host1_percentage,
  host2_pct: balance.host2_percentage,
  valid: validation.valid,
  generation_time_ms: endTime - startTime,
});
```

## Future Enhancements

- [ ] Support for more than 2 hosts
- [ ] Customizable host personalities
- [ ] Multiple language support
- [ ] User feedback integration
- [ ] A/B testing for prompts
- [ ] Dynamic duration adjustment
- [ ] Emotion markers for TTS
- [ ] Background music cues
- [ ] Sound effect placeholders
- [ ] Script templates for different occasions

## References

- [OpenAI GPT-4 Documentation](https://platform.openai.com/docs/models/gpt-4)
- [OpenAI API Pricing](https://openai.com/pricing)
- [JSON Mode](https://platform.openai.com/docs/guides/text-generation/json-mode)
