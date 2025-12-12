# Podcast Generation Service

Complete orchestration service that coordinates the entire podcast generation pipeline from data fetching to final episode delivery.

## Files

### `podcast.generator.ts`
Main orchestration service that manages the full podcast generation workflow.

**Features:**
- ✅ Complete pipeline orchestration (5 steps)
- ✅ Progress tracking with callbacks
- ✅ Data fetching (emails + calendar)
- ✅ Script generation with GPT-4
- ✅ Audio synthesis with OpenAI TTS
- ✅ Cloud storage upload
- ✅ Database persistence
- ✅ Error handling and retries
- ✅ Cost estimation
- ✅ Prerequisites validation
- ✅ Generation statistics
- ✅ Scheduled generation support

**Key Methods:**
```typescript
// Generate complete episode
const result = await podcastGenerator.generateEpisode(
  userId,
  preferences,
  {
    parallel_tts: true,
    tts_concurrency: 5,
    onProgress: (progress) => {
      console.log(`${progress.progress_percent}%: ${progress.message}`);
    }
  }
);

// Estimate cost before generation
const estimate = await podcastGenerator.estimateGenerationCost(userId, preferences);
console.log(`Total cost: $${estimate.total_cost_usd}`);

// Validate prerequisites
const validation = await podcastGenerator.validatePrerequisites(userId);
if (!validation.valid) {
  console.error('Issues:', validation.issues);
}
```

## Generation Pipeline

```
┌─────────────────────────────────────────────────────────┐
│         Complete Podcast Generation Pipeline            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Step 1: Fetch Data (20%)                               │
│    ├─ Fetch emails from Gmail API                       │
│    │   - Filter last 24 hours                           │
│    │   - Exclude promotions/social                      │
│    │   - Return top 50 emails                           │
│    │                                                     │
│    └─ Fetch calendar events from Google Calendar        │
│        - Today and tomorrow events                      │
│        - Expand recurring events                        │
│        - Extract attendees                              │
│           ↓                                              │
│  Step 2: Generate Script (40%)                          │
│    ├─ Process content summaries                         │
│    │   - Filter top 10 relevant emails                  │
│    │   - Extract action items                           │
│    │   - Identify next event                            │
│    │   - Determine priorities                           │
│    │                                                     │
│    └─ Generate with GPT-4                               │
│        - Two-host conversation                          │
│        - Natural dialogue                               │
│        - Validate script quality                        │
│        - Check structure                                │
│           ↓                                              │
│  Step 3: Generate Audio (70%)                           │
│    ├─ Configure voices                                  │
│    │   - Host 1: nova (energetic)                       │
│    │   - Host 2: onyx (authoritative)                   │
│    │   - Speed: 1.0 (normal)                            │
│    │   - Model: tts-1-hd                                │
│    │                                                     │
│    └─ Synthesize segments                               │
│        - Parallel processing (5 concurrent)             │
│        - Retry on failures                              │
│        - Validate audio segments                        │
│           ↓                                              │
│  Step 4: Upload Audio (90%)                             │
│    ├─ Concatenate segments                              │
│    ├─ Upload to cloud storage                           │
│    │   - Supabase Storage (or Cloud Storage)            │
│    │   - Public or signed URLs                          │
│    │   - 1-hour cache control                           │
│    │                                                     │
│    └─ Get public URL                                    │
│           ↓                                              │
│  Step 5: Save Episode (100%)                            │
│    ├─ Generate title and description                    │
│    ├─ Save to database                                  │
│    │   - Episode metadata                               │
│    │   - Script JSON                                    │
│    │   - Audio URL                                      │
│    │   - Duration                                       │
│    │   - Status: completed                              │
│    │                                                     │
│    └─ Return episode ID                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Usage Examples

### Basic Episode Generation

```typescript
import { podcastGenerator } from './services/podcast/podcast.generator';

async function generateDailyBriefing(userId: string) {
  // Define user preferences
  const preferences = {
    briefing_time: '07:00',
    topics: ['work', 'meetings'],
    voice_host1: 'nova',
    voice_host2: 'onyx',
    include_weather: false,
    include_calendar: true,
    include_email: true,
  };

  // Generate episode
  const result = await podcastGenerator.generateEpisode(
    userId,
    preferences
  );

  console.log('Episode generated!');
  console.log(`ID: ${result.episode_id}`);
  console.log(`URL: ${result.audio_url}`);
  console.log(`Duration: ${result.duration_seconds}s`);

  return result;
}
```

### Generation with Progress Tracking

```typescript
async function generateWithProgress(userId: string, preferences: UserPreferences) {
  const result = await podcastGenerator.generateEpisode(
    userId,
    preferences,
    {
      onProgress: async (progress) => {
        console.log(`[${progress.progress_percent}%] ${progress.step}: ${progress.message}`);

        // Update UI or database
        await updateJobProgress(userId, progress);
      }
    }
  );

  return result;
}

// Progress events:
// [0%] initialize: Starting podcast generation...
// [20%] data_fetched: Fetched 12 emails and 5 events
// [40%] script_generated: Generated script with 15 segments
// [70%] audio_generated: Generated 15 audio segments
// [90%] audio_uploaded: Audio uploaded to storage
// [100%] completed: Podcast generation completed
```

### Custom Generation Options

```typescript
const result = await podcastGenerator.generateEpisode(
  userId,
  preferences,
  {
    // Skip email fetching (calendar only)
    skip_email: false,

    // Skip calendar fetching (email only)
    skip_calendar: false,

    // Skip upload for testing
    skip_upload: true, // Saves to local file instead

    // Custom TTS speed
    voice_speed: 1.1, // 10% faster

    // Disable parallel TTS (safer for rate limits)
    parallel_tts: false,

    // Custom concurrency for parallel mode
    tts_concurrency: 3, // 3 concurrent requests instead of 5

    // Progress callback
    onProgress: (progress) => {
      console.log(progress.message);
    }
  }
);
```

### Scheduled Generation

```typescript
// Generate for user's scheduled time
const result = await podcastGenerator.generateScheduledPodcast(userId);

// This will:
// 1. Fetch user from database
// 2. Get user preferences
// 3. Generate episode
// 4. Save to database
```

### Cost Estimation

```typescript
// Estimate cost before generating
const estimate = await podcastGenerator.estimateGenerationCost(
  userId,
  preferences
);

console.log(`Estimated costs:`);
console.log(`  Script: $${estimate.script_cost_usd}`);
console.log(`  TTS: $${estimate.tts_cost_usd}`);
console.log(`  Total: $${estimate.total_cost_usd}`);
console.log(`  Duration: ~${estimate.estimated_duration_seconds}s`);

// Only proceed if cost is acceptable
if (estimate.total_cost_usd < 0.20) {
  await podcastGenerator.generateEpisode(userId, preferences);
} else {
  console.warn('Cost too high, skipping generation');
}
```

### Prerequisites Validation

```typescript
// Check if user can generate podcast
const validation = await podcastGenerator.validatePrerequisites(userId);

if (!validation.valid) {
  console.error('Cannot generate podcast:');
  validation.issues.forEach(issue => {
    console.error(`  - ${issue}`);
  });

  // Issues might include:
  // - No OAuth tokens found
  // - OpenAI API key not configured
  // - Google OAuth not configured
} else {
  // Safe to generate
  await podcastGenerator.generateEpisode(userId, preferences);
}
```

### Error Handling

```typescript
try {
  const result = await podcastGenerator.generateEpisode(
    userId,
    preferences,
    {
      onProgress: async (progress) => {
        if (progress.progress_percent === -1) {
          // Generation failed
          console.error('Failed:', progress.message);
        }
      }
    }
  );
} catch (error) {
  console.error('Generation error:', error);

  // Possible errors:
  // - No Gmail authentication found
  // - Script generation failed
  // - Audio validation failed
  // - Upload failed
  // - Database save failed

  // Handle appropriately
  if (error.message.includes('authentication')) {
    // Redirect to OAuth flow
  } else if (error.message.includes('rate limit')) {
    // Retry later
  }
}
```

### Batch Generation

```typescript
// Generate for multiple users
async function generateBatchPodcasts(users: Array<{ id: string; preferences: UserPreferences }>) {
  const results = await Promise.allSettled(
    users.map(user =>
      podcastGenerator.generateEpisode(user.id, user.preferences)
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      console.log(`User ${index}: Success - ${result.value.audio_url}`);
    } else {
      console.error(`User ${index}: Failed - ${result.reason}`);
    }
  });

  return results;
}
```

## Progress Events

| Step | Progress % | Description |
|------|-----------|-------------|
| `initialize` | 0% | Starting generation |
| `data_fetched` | 20% | Emails and events fetched |
| `script_generated` | 40% | Script created |
| `audio_generated` | 70% | Audio synthesized |
| `audio_uploaded` | 90% | Audio uploaded |
| `completed` | 100% | Generation complete |
| `failed` | -1% | Generation failed |

## Cost Breakdown

### Typical 5-Minute Episode

| Component | Cost |
|-----------|------|
| **GPT-4 Script** | $0.08-$0.12 |
| - Input tokens (1.5K) | $0.015 |
| - Output tokens (3K) | $0.09 |
| **OpenAI TTS** | $0.06-$0.08 |
| - 2,500 characters | $0.075 |
| **Storage** | $0.001 |
| - 5 MB file | ~$0.001/month |
| **TOTAL** | **$0.14-$0.20** |

### Monthly Costs

| Users | Episodes/Day | Monthly Cost |
|-------|-------------|--------------|
| 1 | 1 | $4.20-$6.00 |
| 10 | 10 | $42-$60 |
| 100 | 100 | $420-$600 |
| 1,000 | 1,000 | $4,200-$6,000 |

**Cost optimization tips:**
- Use caching for repeated generations
- Implement daily limits per user
- Offer tiered pricing plans
- Cache script templates
- Reuse audio for common segments

## Generation Statistics

```typescript
// Get statistics for monitoring
const stats = await podcastGenerator.getGenerationStats(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

console.log(`January Statistics:`);
console.log(`  Total episodes: ${stats.total_episodes}`);
console.log(`  Successful: ${stats.successful}`);
console.log(`  Failed: ${stats.failed}`);
console.log(`  Avg duration: ${stats.average_duration_seconds}s`);
console.log(`  Total cost: $${stats.total_cost_usd}`);

// Success rate
const successRate = (stats.successful / stats.total_episodes) * 100;
console.log(`  Success rate: ${successRate.toFixed(1)}%`);
```

## Integration Examples

### Express API Endpoint

```typescript
import express from 'express';
import { podcastGenerator } from './services/podcast/podcast.generator';

const router = express.Router();

router.post('/generate', async (req, res) => {
  const { userId, preferences } = req.body;

  try {
    // Validate prerequisites
    const validation = await podcastGenerator.validatePrerequisites(userId);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        issues: validation.issues
      });
    }

    // Estimate cost
    const estimate = await podcastGenerator.estimateGenerationCost(userId, preferences);

    // Generate episode
    const result = await podcastGenerator.generateEpisode(
      userId,
      preferences,
      {
        onProgress: async (progress) => {
          // Send progress via WebSocket or SSE
          await sendProgress(userId, progress);
        }
      }
    );

    res.json({
      success: true,
      episode: result,
      cost: estimate
    });
  } catch (error) {
    console.error('Generation failed:', error);
    res.status(500).json({
      error: 'Generation failed',
      message: error.message
    });
  }
});

export default router;
```

### Cron Job for Scheduled Generation

```typescript
import cron from 'node-cron';
import { podcastGenerator } from './services/podcast/podcast.generator';

// Generate daily briefings at 6 AM
cron.schedule('0 6 * * *', async () => {
  console.log('Starting scheduled podcast generation...');

  // Get all users with scheduled briefings
  // const users = await getUsersWithScheduledBriefings();

  const users = [
    { id: 'user1@example.com', preferences: {...} },
    { id: 'user2@example.com', preferences: {...} },
  ];

  for (const user of users) {
    try {
      const result = await podcastGenerator.generateScheduledPodcast(user.id);
      console.log(`Generated for ${user.id}: ${result.episode_id}`);
    } catch (error) {
      console.error(`Failed for ${user.id}:`, error);
    }
  }
});
```

### Queue-Based Processing

```typescript
import { Queue, Worker } from 'bullmq';
import { podcastGenerator } from './services/podcast/podcast.generator';

// Create queue
const podcastQueue = new Queue('podcast-generation');

// Add job to queue
async function queuePodcastGeneration(userId: string, preferences: UserPreferences) {
  await podcastQueue.add('generate', {
    userId,
    preferences
  });
}

// Process jobs
const worker = new Worker('podcast-generation', async (job) => {
  const { userId, preferences } = job.data;

  const result = await podcastGenerator.generateEpisode(
    userId,
    preferences,
    {
      onProgress: async (progress) => {
        await job.updateProgress(progress.progress_percent);
      }
    }
  );

  return result;
});
```

## Best Practices

### 1. Always Validate Prerequisites
```typescript
const validation = await podcastGenerator.validatePrerequisites(userId);
if (!validation.valid) {
  // Handle missing prerequisites
}
```

### 2. Estimate Costs First
```typescript
const estimate = await podcastGenerator.estimateGenerationCost(userId, preferences);
if (estimate.total_cost_usd > maxCost) {
  // Notify user or skip generation
}
```

### 3. Use Progress Tracking
```typescript
await podcastGenerator.generateEpisode(userId, preferences, {
  onProgress: async (progress) => {
    // Update UI, database, or send notifications
    await updateProgress(userId, progress);
  }
});
```

### 4. Handle Errors Gracefully
```typescript
try {
  const result = await podcastGenerator.generateEpisode(userId, preferences);
} catch (error) {
  // Log error
  console.error('Generation failed:', error);

  // Save failed episode to database
  await saveFailed Episode(userId, error.message);

  // Notify user
  await notifyUser(userId, 'Generation failed');
}
```

### 5. Implement Rate Limiting
```typescript
// Limit generations per user per day
const dailyCount = await getGenerationCount(userId, today);
if (dailyCount >= maxDailyGenerations) {
  throw new Error('Daily generation limit reached');
}
```

### 6. Cache When Possible
```typescript
// Check cache first
const cacheKey = `podcast:${userId}:${date}`;
const cached = await redis.get(cacheKey);
if (cached) {
  return JSON.parse(cached);
}

// Generate and cache
const result = await podcastGenerator.generateEpisode(userId, preferences);
await redis.setex(cacheKey, 86400, JSON.stringify(result)); // 24 hour TTL
```

## Monitoring

### Key Metrics to Track
- Total generations per day
- Success rate
- Average generation time
- Average cost per episode
- Failure reasons
- Storage usage
- API quota usage (OpenAI, Google)

### Logging Example
```typescript
console.log({
  event: 'podcast_generated',
  user_id: userId,
  episode_id: result.episode_id,
  duration_seconds: result.duration_seconds,
  audio_size_mb: stats.audio_size_mb,
  script_cost_usd: stats.script_cost_usd,
  tts_cost_usd: stats.tts_cost_usd,
  total_cost_usd: stats.total_cost_usd,
  generation_time_ms: stats.duration_ms,
  email_count: stats.email_count,
  calendar_event_count: stats.calendar_event_count,
});
```

## Troubleshooting

### Issue: "No Gmail authentication found"
**Solution**: User needs to complete OAuth flow
```bash
# Redirect user to OAuth
GET /api/auth/oauth/google
```

### Issue: Generation times out
**Solution**: Increase timeouts or use queue-based processing
```typescript
// Use queue for long-running jobs
await podcastQueue.add('generate', { userId, preferences });
```

### Issue: High costs
**Solution**: Implement caching and limits
```typescript
// Check daily generation count
if (dailyCount >= limit) {
  throw new Error('Daily limit reached');
}
```

### Issue: Audio quality poor
**Solution**: Use tts-1-hd model and check script quality
```typescript
// Ensure using HD model
const voiceConfig = {
  ...config,
  model: 'tts-1-hd'
};
```

## Future Enhancements

- [ ] Background music mixing
- [ ] Multi-language support
- [ ] Custom voice cloning
- [ ] Real-time streaming generation
- [ ] Podcast analytics
- [ ] User feedback integration
- [ ] A/B testing for voice pairs
- [ ] Dynamic content recommendations
- [ ] Social media integration
- [ ] RSS feed generation

## References

- [Gmail API](../email/README.md)
- [Calendar API](../calendar/README.md)
- [Script Generator](../ai/README.md)
- [TTS Service](../tts/README.md)
- [Storage Service](../storage/README.md)
