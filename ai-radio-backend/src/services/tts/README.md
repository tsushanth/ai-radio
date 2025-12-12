# Text-to-Speech (TTS) Services

OpenAI TTS integration for converting podcast scripts to natural-sounding audio with multiple voices.

## Files

### `openai.tts.ts`
Complete OpenAI TTS API integration for high-quality voice synthesis.

**Features:**
- ✅ Multiple voice support (6 voices: alloy, echo, fable, onyx, nova, shimmer)
- ✅ Dual-voice podcast generation (different voices for each host)
- ✅ High-quality audio (tts-1-hd model)
- ✅ Adjustable speech speed (0.25x - 4.0x)
- ✅ Automatic retry with exponential backoff
- ✅ Parallel processing for faster generation
- ✅ Long text handling (auto-chunking for 4096+ char texts)
- ✅ Cost estimation
- ✅ Rate limit management

**Key Methods:**
```typescript
// Single text synthesis
const audio = await openaiTTS.synthesize({
  text: 'Hello, welcome to your daily briefing!',
  voice: 'nova',
  speed: 1.0
});

// Synthesize entire script (sequential)
const voiceConfig = {
  host1: 'nova',
  host2: 'onyx',
  model: 'tts-1-hd',
  speed: 1.0
};
const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);

// Synthesize with parallel processing (faster)
const audioSegments = await openaiTTS.synthesizeScriptParallel(
  script,
  voiceConfig,
  5 // concurrent requests
);

// Estimate cost
const estimate = openaiTTS.estimateCost(script);
console.log(`Cost: $${estimate.estimated_cost_usd}`);
```

### `audio.utils.ts`
Utilities for audio processing, analysis, and validation.

**Features:**
- ✅ Duration and size calculations
- ✅ Detailed audio statistics
- ✅ Segment validation
- ✅ Timing information generation
- ✅ Metadata export
- ✅ Bitrate estimation
- ✅ Format conversion helpers

**Key Functions:**
```typescript
import {
  getAudioStatistics,
  formatDuration,
  calculateTotalDuration,
  generateTimingInfo,
  validateAllSegments,
} from './audio.utils';

// Get statistics
const stats = getAudioStatistics(audioSegments);
console.log(`Duration: ${stats.total_duration}`);
console.log(`Size: ${stats.total_size}`);

// Generate timing info
const timing = generateTimingInfo(audioSegments);
// [{ start_time: '0:00', end_time: '0:15', duration: '0:15' }, ...]

// Validate segments
const validation = validateAllSegments(audioSegments);
console.log(`Valid: ${validation.all_valid}`);
```

## TTS Generation Pipeline

```
┌─────────────────────────────────────────────────────────┐
│         Text-to-Speech Generation Pipeline              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Receive Script (segments with text)                 │
│           ↓                                              │
│  2. Configure Voices                                     │
│      - Host 1: nova (energetic, upbeat)                 │
│      - Host 2: onyx (deep, authoritative)               │
│      - Speed: 1.0 (normal)                              │
│      - Model: tts-1-hd (high quality)                   │
│           ↓                                              │
│  3. Process Segments                                     │
│      Option A: Sequential (safer, respects rate limits) │
│      Option B: Parallel (faster, 5 concurrent)          │
│           ↓                                              │
│  4. For Each Segment:                                    │
│      - Determine voice (host1 or host2)                 │
│      - Check text length (< 4096 chars)                 │
│      - Call OpenAI TTS API                              │
│      - Retry on failure (3 attempts, exp backoff)       │
│      - Convert response to Buffer                       │
│      - Estimate duration                                │
│           ↓                                              │
│  5. Create AudioSegment                                  │
│      - buffer: audio data                               │
│      - duration_seconds: estimated                      │
│      - speaker: host1 | host2                           │
│      - segment_type: intro | email | calendar | outro   │
│           ↓                                              │
│  6. Validate Audio                                       │
│      - Check buffer not empty                           │
│      - Validate MP3 format                              │
│      - Verify duration > 0                              │
│           ↓                                              │
│  7. Return AudioSegment[]                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Available Voices

### Voice Characteristics

| Voice | Gender | Tone | Best For | Example Use |
|-------|--------|------|----------|-------------|
| **alloy** | Neutral | Balanced | General purpose | Versatile narration |
| **echo** | Male | Warm | Friendly conversations | Casual content |
| **fable** | Male | Articulate | Professional narration | Business content |
| **onyx** | Male | Authoritative | Analytical content | **Host 2 (default)** |
| **nova** | Female | Energetic | Engaging content | **Host 1 (default)** |
| **shimmer** | Female | Gentle | Calm narration | Soothing content |

### Recommended Voice Pairs

1. **nova + onyx** (Default)
   - Energetic female + Deep male
   - Perfect for conversational podcasts
   - High energy with balanced analysis

2. **echo + alloy**
   - Warm male + Neutral
   - Professional and approachable
   - Good for business briefings

3. **fable + shimmer**
   - Articulate male + Gentle female
   - Sophisticated and polished
   - British accent + soft American

4. **nova + echo**
   - Two warm voices
   - Very friendly and casual
   - Great for lighthearted content

## Audio Specifications

### Output Format
- **Format**: MP3
- **Model**: tts-1-hd (high definition)
- **Sample Rate**: 24 kHz
- **Bitrate**: ~128 kbps (variable)
- **Channels**: Mono
- **Quality**: High fidelity, natural prosody

### Performance Metrics
- **Generation Speed**: ~1.5-3x realtime
- **Latency**: 1-3 seconds per segment
- **Parallel Processing**: 5 concurrent requests
- **Rate Limit**: 50 requests/minute
- **Max Text Length**: 4096 characters per request

## Cost Estimation

### OpenAI TTS Pricing
- **tts-1**: $15 per 1M characters
- **tts-1-hd**: $30 per 1M characters
- We use **tts-1-hd** for quality

### Example Costs

| Script Length | Characters | Segments | Cost (HD) |
|--------------|------------|----------|-----------|
| 3 minutes | 1,500 | 10 | $0.045 |
| 5 minutes | 2,500 | 15 | $0.075 |
| 10 minutes | 5,000 | 25 | $0.150 |

**Monthly Cost Examples:**
- **Daily briefing** (5 min): ~$2.25/month
- **Daily briefing** (10 min): ~$4.50/month
- **100 users** (5 min): ~$225/month

```typescript
// Calculate cost before generation
const estimate = openaiTTS.estimateCost(script);
console.log(`Total characters: ${estimate.total_characters}`);
console.log(`Estimated cost: $${estimate.estimated_cost_usd}`);
console.log(`Cost per segment: $${estimate.cost_per_segment}`);
```

## Usage Examples

### Basic TTS Synthesis

```typescript
import { openaiTTS } from './services/tts/openai.tts';

// Single text to speech
const result = await openaiTTS.synthesize({
  text: 'Good morning! Welcome to your daily briefing.',
  voice: 'nova',
  speed: 1.0
});

console.log(`Generated ${result.audio_buffer.length} bytes`);
console.log(`Duration: ${result.duration_seconds}s`);

// Save to file
fs.writeFileSync('intro.mp3', result.audio_buffer);
```

### Generate Full Podcast

```typescript
import { scriptGenerator } from './services/ai/script.generator';
import { openaiTTS } from './services/tts/openai.tts';

async function generatePodcast(input: PodcastGenerationInput) {
  // 1. Generate script
  const script = await scriptGenerator.generateScript(input);

  // 2. Configure voices
  const voiceConfig = openaiTTS.getDefaultVoiceConfig();
  // or from user preferences:
  // const voiceConfig = openaiTTS.getVoiceConfigFromPreferences(input.preferences);

  // 3. Estimate cost
  const estimate = openaiTTS.estimateCost(script);
  console.log(`Will cost approximately $${estimate.estimated_cost_usd}`);

  // 4. Generate audio (parallel for speed)
  const audioSegments = await openaiTTS.synthesizeScriptParallel(
    script,
    voiceConfig,
    5 // 5 concurrent requests
  );

  // 5. Calculate duration
  const totalDuration = openaiTTS.calculateTotalDuration(audioSegments);
  console.log(`Generated ${totalDuration}s of audio`);

  return audioSegments;
}
```

### Sequential Processing (Safer)

```typescript
// Process segments one at a time (respects rate limits strictly)
const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);

// Progress tracking
for (let i = 0; i < script.segments.length; i++) {
  const segment = script.segments[i];
  console.log(`Processing ${i + 1}/${script.segments.length}: ${segment.text.substring(0, 50)}...`);

  const audio = await openaiTTS.synthesizeSegment(segment, voiceConfig);
  audioSegments.push(audio);
}
```

### Parallel Processing (Faster)

```typescript
// Process multiple segments concurrently
const audioSegments = await openaiTTS.synthesizeScriptParallel(
  script,
  voiceConfig,
  5 // Process 5 at a time
);

// Even faster with more concurrency (be careful of rate limits)
const audioSegments = await openaiTTS.synthesizeScriptParallel(
  script,
  voiceConfig,
  10 // Process 10 at a time (may hit rate limits)
);
```

### Retry Logic

```typescript
// Automatic retry with exponential backoff
try {
  const audio = await openaiTTS.synthesizeWithRetry({
    text: 'Important message',
    voice: 'nova',
  }, 3); // 3 retries max
} catch (error) {
  console.error('Failed after 3 retries:', error);
}
```

### Long Text Handling

```typescript
// Automatically split long text into chunks
const longText = '...very long text over 4096 characters...';

const responses = await openaiTTS.synthesizeLongText(
  longText,
  'nova',
  1.0
);

// Combine chunks if needed
const buffers = responses.map(r => r.audio_buffer);
const combined = Buffer.concat(buffers);
```

### Custom Voice Configuration

```typescript
// Custom voice pairing
const customConfig: VoiceConfig = {
  host1: 'echo',    // Warm male
  host2: 'shimmer', // Gentle female
  model: 'tts-1-hd',
  speed: 1.1        // Slightly faster
};

const audioSegments = await openaiTTS.synthesizeScript(script, customConfig);
```

### Get Audio Statistics

```typescript
import { getAudioStatistics } from './audio.utils';

const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
const stats = getAudioStatistics(audioSegments);

console.log(`
Total Segments: ${stats.total_segments}
Total Duration: ${stats.total_duration}
Total Size: ${stats.total_size}
Host 1 Segments: ${stats.host1_segments}
Host 2 Segments: ${stats.host2_segments}
Host 1 Duration: ${formatDuration(stats.host1_duration)}
Host 2 Duration: ${formatDuration(stats.host2_duration)}
Average Segment: ${stats.average_segment_duration}s
`);
```

### Generate Timing Information

```typescript
import { generateTimingInfo, formatDuration } from './audio.utils';

const timing = generateTimingInfo(audioSegments);

timing.forEach(t => {
  console.log(`${t.segment_index}. ${t.speaker} (${t.type})`);
  console.log(`   ${t.start_time} - ${t.end_time} (${t.duration})`);
});

// Output:
// 1. host1 (intro)
//    0:00 - 0:12 (0:12)
// 2. host2 (intro)
//    0:12 - 0:25 (0:13)
// ...
```

### Validate Audio Segments

```typescript
import { validateAllSegments, getAudioStatistics } from './audio.utils';

const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);

// Validate all segments
const validation = validateAllSegments(audioSegments);

if (!validation.all_valid) {
  console.error(`${validation.invalid_count} invalid segments found:`);
  validation.issues.forEach(issue => {
    console.error(`Segment ${issue.index}:`, issue.issues.join(', '));
  });
}
```

### Export Metadata

```typescript
import { exportMetadata } from './audio.utils';

const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
const metadata = exportMetadata(audioSegments);

// Save metadata
fs.writeFileSync('podcast_metadata.json', JSON.stringify(metadata, null, 2));

// Metadata includes:
// - total_segments, total_duration_seconds, total_size_bytes
// - Per-segment: index, speaker, type, duration, size, bitrate
```

### Save Individual Segments

```typescript
// Save each segment as separate file
audioSegments.forEach((segment, index) => {
  const filename = `segment_${index + 1}_${segment.speaker}_${segment.segment_type}.mp3`;
  fs.writeFileSync(filename, segment.buffer);
  console.log(`Saved ${filename} (${formatFileSize(segment.buffer.length)})`);
});
```

### Concatenate Segments

```typescript
import { concatenateBuffers } from './audio.utils';

// Combine all segments into one file
const allBuffers = audioSegments.map(s => s.buffer);
const finalAudio = concatenateBuffers(allBuffers);

fs.writeFileSync('complete_podcast.mp3', finalAudio);
console.log(`Saved complete podcast (${formatFileSize(finalAudio.length)})`);
```

## Error Handling

### API Errors

```typescript
try {
  const audio = await openaiTTS.synthesize(request);
} catch (error) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      // Rate limit exceeded
      console.error('Rate limit hit, waiting before retry...');
      await delay(60000); // Wait 1 minute
    } else if (error.status === 401) {
      // Invalid API key
      console.error('Invalid OpenAI API key');
    } else if (error.status >= 500) {
      // Server error, retry
      console.error('OpenAI server error, retrying...');
    }
  }
}
```

### Retry Strategy

```typescript
// Automatic retry with exponential backoff
// Attempt 1: immediate
// Attempt 2: wait 1 second
// Attempt 3: wait 2 seconds
// Attempt 4: wait 4 seconds

const audio = await openaiTTS.synthesizeWithRetry(request, 4);
```

### Validation Errors

```typescript
import { validateAudioSegment } from './audio.utils';

const segment = await openaiTTS.synthesizeSegment(scriptSegment, voiceConfig);
const validation = validateAudioSegment(segment);

if (!validation.valid) {
  console.error('Invalid audio segment:', validation.issues);
  // Regenerate or handle error
}
```

## Best Practices

### 1. Use Parallel Processing for Speed
```typescript
// Good: 5 concurrent requests
const audio = await openaiTTS.synthesizeScriptParallel(script, config, 5);

// Avoid: Too many concurrent (may hit rate limits)
const audio = await openaiTTS.synthesizeScriptParallel(script, config, 20);
```

### 2. Estimate Costs First
```typescript
const estimate = openaiTTS.estimateCost(script);

if (estimate.estimated_cost_usd > 0.50) {
  console.warn('High cost detected, consider script optimization');
  // Maybe truncate script or reduce segments
}
```

### 3. Handle Rate Limits Gracefully
```typescript
// Use recommended concurrency
const rateLimits = openaiTTS.getRateLimitInfo();
const audio = await openaiTTS.synthesizeScriptParallel(
  script,
  config,
  rateLimits.recommended_concurrency
);
```

### 4. Validate Before Storage
```typescript
const validation = validateAllSegments(audioSegments);

if (validation.all_valid) {
  // Safe to save/upload
  await saveToStorage(audioSegments);
} else {
  // Regenerate invalid segments
  console.error('Validation failed:', validation.issues);
}
```

### 5. Monitor Quality
```typescript
const stats = getAudioStatistics(audioSegments);
const avgBitrate = calculateAverageBitrate(audioSegments);

if (avgBitrate < 64) {
  console.warn('Low bitrate detected, audio quality may be poor');
}

if (stats.average_segment_duration < 5) {
  console.warn('Very short segments, consider merging');
}
```

## Performance Optimization

### Caching
```typescript
// Cache generated audio to avoid regeneration
const cacheKey = `audio:${scriptId}:${voiceConfig.host1}:${voiceConfig.host2}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const audio = await openaiTTS.synthesizeScript(script, voiceConfig);
await redis.setex(cacheKey, 3600, JSON.stringify(audio)); // 1 hour TTL
```

### Batch Processing
```typescript
// Generate for multiple users in parallel
const podcastPromises = users.map(user =>
  generatePodcast(user.input)
);

const podcasts = await Promise.allSettled(podcastPromises);

podcasts.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`User ${index}: Success`);
  } else {
    console.error(`User ${index}: Failed -`, result.reason);
  }
});
```

### Progressive Delivery
```typescript
// Stream segments as they're generated
async function* generateAudioStream(script, config) {
  for (const segment of script.segments) {
    const audio = await openaiTTS.synthesizeSegment(segment, config);
    yield audio;
  }
}

// Consumer
for await (const audioSegment of generateAudioStream(script, config)) {
  // Upload or process immediately
  await uploadSegment(audioSegment);
}
```

## Testing

### Unit Tests
```typescript
import { openaiTTS } from './openai.tts';

describe('OpenAI TTS', () => {
  it('should synthesize text', async () => {
    const result = await openaiTTS.synthesize({
      text: 'Test message',
      voice: 'nova',
    });

    expect(result.audio_buffer).toBeDefined();
    expect(result.audio_buffer.length).toBeGreaterThan(0);
    expect(result.duration_seconds).toBeGreaterThan(0);
  });

  it('should estimate cost correctly', () => {
    const estimate = openaiTTS.estimateCost(mockScript);
    expect(estimate.estimated_cost_usd).toBeGreaterThan(0);
  });
});
```

### Integration Tests
```typescript
// Test full pipeline
const script = await scriptGenerator.generateScript(input);
const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
const validation = validateAllSegments(audioSegments);

assert(validation.all_valid, 'All segments should be valid');
assert(audioSegments.length === script.total_segments, 'Segment count should match');
```

## Monitoring

### Key Metrics
- TTS generation success rate
- Average generation time per segment
- Total audio duration generated
- Daily/monthly costs
- Rate limit hits
- Retry counts
- Average audio quality (bitrate)

### Logging Example
```typescript
console.log({
  event: 'tts_generated',
  script_id: script.id,
  segments: audioSegments.length,
  total_duration: calculateTotalDuration(audioSegments),
  total_size_mb: calculateTotalSize(audioSegments).megabytes,
  cost_usd: estimate.estimated_cost_usd,
  voices: `${voiceConfig.host1}+${voiceConfig.host2}`,
  generation_time_ms: endTime - startTime,
});
```

## Troubleshooting

### Issue: Rate limit exceeded
**Solution**: Reduce concurrency or add delays
```typescript
// Reduce from 5 to 3 concurrent
const audio = await openaiTTS.synthesizeScriptParallel(script, config, 3);
```

### Issue: Low audio quality
**Solution**: Check model setting
```typescript
// Ensure using HD model
const config = {
  ...voiceConfig,
  model: 'tts-1-hd' // Not 'tts-1'
};
```

### Issue: Slow generation
**Solution**: Use parallel processing
```typescript
// Sequential (slow)
const audio = await openaiTTS.synthesizeScript(script, config);

// Parallel (faster)
const audio = await openaiTTS.synthesizeScriptParallel(script, config, 5);
```

### Issue: Text too long error
**Solution**: Use automatic chunking
```typescript
const responses = await openaiTTS.synthesizeLongText(veryLongText, 'nova');
```

## Future Enhancements

- [ ] Audio normalization across segments
- [ ] Crossfade between segments
- [ ] Background music mixing
- [ ] Sound effects insertion
- [ ] Emotion/emphasis markers
- [ ] Pause/breath control
- [ ] Multi-language support
- [ ] Voice cloning integration
- [ ] Real-time streaming
- [ ] Compression optimization

## References

- [OpenAI TTS Documentation](https://platform.openai.com/docs/guides/text-to-speech)
- [OpenAI TTS API Reference](https://platform.openai.com/docs/api-reference/audio)
- [TTS Pricing](https://openai.com/pricing)
- [Voice Samples](https://platform.openai.com/docs/guides/text-to-speech/voice-options)
