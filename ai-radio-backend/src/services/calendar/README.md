# Calendar Services

Google Calendar integration for fetching, parsing, and analyzing calendar events for podcast briefings.

## Files

### `calendar.service.ts`
Complete Google Calendar API integration for fetching events and free/busy information.

**Features:**
- ✅ Fetch events with flexible time ranges
- ✅ Automatic OAuth token management and refresh
- ✅ Single event expansion for recurring events
- ✅ Calendar list retrieval
- ✅ Free/busy information
- ✅ Event search functionality
- ✅ Event count queries
- ✅ All-day event support
- ✅ Attendee extraction

**Key Methods:**
```typescript
// Fetch today's and tomorrow's events
const events = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

// Fetch events for next N days
const upcoming = await googleCalendarService.fetchUpcomingEvents(userId, 7);

// Custom time range
const events = await googleCalendarService.fetchEvents(userId, {
  days_ahead: 3,
  include_past_today: false
});

// Search events
const results = await googleCalendarService.searchEvents(
  userId,
  'team meeting',
  new Date(),
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
);

// Get free/busy info
const freeBusy = await googleCalendarService.getFreeBusy(
  userId,
  new Date(),
  new Date(Date.now() + 24 * 60 * 60 * 1000)
);
```

### `calendar.utils.ts`
Utility functions for event analysis, priority determination, and schedule management.

**Features:**
- ✅ Priority determination (high/medium/low)
- ✅ Preparation requirement detection
- ✅ Human-readable time descriptions
- ✅ Duration calculations and formatting
- ✅ Free time block calculation
- ✅ Daily schedule summaries
- ✅ Event grouping and filtering
- ✅ Schedule conflict detection
- ✅ Calendar statistics

**Key Functions:**
```typescript
import {
  determineEventPriority,
  getTimeDescription,
  generateDailySummary,
  filterTodayEvents,
  summarizeEvent,
} from './calendar.utils';

// Determine priority
const priority = determineEventPriority(event);
// Returns: 'high' | 'medium' | 'low'

// Get time description
const timeDesc = getTimeDescription(event.start_time);
// Returns: "in 2 hours", "tomorrow at 3 PM", etc.

// Generate daily summary
const summary = generateDailySummary(events);
// Returns: { total_events, busy_periods, important_events, free_time_blocks }

// Filter today's events
const todayEvents = filterTodayEvents(events);

// Summarize for briefing
const summary = summarizeEvent(event);
// Returns: "[IMPORTANT] Team Meeting in 2 hours for 1 hour with 5 attendees"
```

## Calendar Event Processing Pipeline

```
┌─────────────────────────────────────────────────────────┐
│         Calendar Fetching & Processing                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Get OAuth Token (auto-refresh if needed)            │
│           ↓                                              │
│  2. Calculate Time Range (today, tomorrow, N days)      │
│           ↓                                              │
│  3. Fetch Events from Google Calendar API               │
│           ↓                                              │
│  4. Expand Recurring Events to Single Instances         │
│           ↓                                              │
│  5. Parse to Standard Format (CalendarEvent)            │
│           ↓                                              │
│  6. Filter Out Cancelled Events                         │
│           ↓                                              │
│  7. Extract Attendees (exclude declined)                │
│           ↓                                              │
│  8. Determine Priority (keywords, attendees, location)  │
│           ↓                                              │
│  9. Check Preparation Requirements                      │
│           ↓                                              │
│  10. Sort by Start Time (earliest first)                │
│           ↓                                              │
│  11. Return CalendarEvent[]                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```typescript
// 1. User makes request
const userId = 'user@example.com';

// 2. Service fetches events
const events = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);
// Returns: CalendarEvent[]

// 3. Filter today's events
const todayEvents = filterTodayEvents(events);

// 4. Generate daily summary
const summary = generateDailySummary(todayEvents);
// {
//   total_events: 5,
//   busy_periods: [...],
//   important_events: [...],
//   free_time_blocks: [...]
// }

// 5. Process for briefing
const briefingEvents = todayEvents.map(event => ({
  summary: summarizeEvent(event),
  priority: determineEventPriority(event),
  requires_prep: requiresPreparation(event)
}));
```

## Google Calendar API Features

### Time Range Queries

The service supports flexible time range queries:

```typescript
// Today only (from now)
const today = await googleCalendarService.fetchTodayEvents(userId);

// Today and tomorrow
const twoDays = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

// Next N days
const week = await googleCalendarService.fetchUpcomingEvents(userId, 7);

// Custom range
const custom = await googleCalendarService.fetchEvents(userId, {
  days_ahead: 5,
  include_past_today: true // Include events from start of today
});
```

### Recurring Events

The service automatically expands recurring events:

```typescript
// A recurring daily standup will return individual instances:
// - Today at 9 AM
// - Tomorrow at 9 AM
// - Day after tomorrow at 9 AM
// etc.
```

### All-Day Events

All-day events are properly detected and handled:

```typescript
{
  title: "Company Holiday",
  is_all_day: true,
  start_time: "2024-01-15T00:00:00Z",
  end_time: "2024-01-15T23:59:59Z"
}
```

## Event Priority Determination

Priority is calculated based on multiple signals:

| Signal | Score |
|--------|-------|
| 5+ attendees | +2 |
| 2-4 attendees | +1 |
| Priority keywords in title | +2 |
| 1:1 meeting | +1 |
| Has location (not Zoom) | +1 |
| All-day event | -1 |

**Priority Keywords:**
`urgent`, `important`, `critical`, `executive`, `board`, `review`, `presentation`, `demo`, `interview`, `deadline`

**Scoring:**
- Score ≥ 3: **High Priority**
- Score 1-2: **Medium Priority**
- Score 0: **Low Priority**

### Preparation Detection

Events are flagged as requiring preparation if title contains:
`presentation`, `demo`, `review`, `interview`, `pitch`, `proposal`, `meeting`, `standup`, `sync`

## Time Descriptions

Human-readable time descriptions for podcast briefings:

| Time Until Event | Description |
|-----------------|-------------|
| ≤ 5 minutes | "starting now" |
| < 1 hour | "in 30 minutes" |
| < 3 hours (today) | "in 2 hours (3:00 PM)" |
| Today | "today at 3:00 PM" |
| Tomorrow | "tomorrow at 9:30 AM" |
| This week | "Wednesday at 2:00 PM" |
| Future | "2024-01-15" |

## Usage Examples

### Basic Event Fetching

```typescript
import { googleCalendarService } from './calendar.service';

// Fetch today and tomorrow
const events = await googleCalendarService.fetchTodayAndTomorrowEvents('user@example.com');

console.log(`Fetched ${events.length} events`);
events.forEach(event => {
  console.log(`- ${event.title} at ${new Date(event.start_time).toLocaleString()}`);
});
```

### Filter and Analyze

```typescript
import {
  filterTodayEvents,
  filterTomorrowEvents,
  filterUpcomingEvents,
  getCalendarStatistics,
} from './calendar.utils';

// Fetch all events
const events = await googleCalendarService.fetchUpcomingEvents(userId, 7);

// Split by day
const todayEvents = filterTodayEvents(events);
const tomorrowEvents = filterTomorrowEvents(events);
const urgentEvents = filterUpcomingEvents(events, 2); // Next 2 hours

// Get statistics
const stats = getCalendarStatistics(todayEvents);
console.log(`
Total events: ${stats.total_events}
High priority: ${stats.by_priority.high}
With attendees: ${stats.with_attendees}
Total meeting time: ${stats.total_meeting_minutes} minutes
Average duration: ${stats.average_meeting_duration} minutes
`);
```

### Generate Daily Summary

```typescript
import { generateDailySummary, summarizeEvent } from './calendar.utils';

// Fetch events
const events = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

// Generate summary for today
const summary = generateDailySummary(events);

console.log(`You have ${summary.total_events} events today`);

// Show important events
summary.important_events.forEach(event => {
  console.log(`[IMPORTANT] ${summarizeEvent(event)}`);
});

// Show free time
console.log('\nFree time blocks:');
summary.free_time_blocks.forEach(block => {
  console.log(`- ${block.duration_minutes} minutes free`);
});
```

### Find Next Event

```typescript
import { getNextEvent, getTimeDescription } from './calendar.utils';

const events = await googleCalendarService.fetchUpcomingEvents(userId, 1);
const next = getNextEvent(events);

if (next) {
  const timeDesc = getTimeDescription(next.start_time);
  console.log(`Next event: ${next.title} ${timeDesc}`);
} else {
  console.log('No upcoming events today');
}
```

### Check for Conflicts

```typescript
import { findScheduleConflicts } from './calendar.utils';

const events = await googleCalendarService.fetchTodayEvents(userId);
const conflicts = findScheduleConflicts(events);

if (conflicts.length > 0) {
  console.log('Warning: Schedule conflicts detected:');
  conflicts.forEach(({ event1, event2 }) => {
    console.log(`- "${event1.title}" overlaps with "${event2.title}"`);
  });
}
```

### Free/Busy Information

```typescript
// Get free/busy for today
const now = new Date();
const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

const freeBusy = await googleCalendarService.getFreeBusy(userId, now, endOfDay);

freeBusy.forEach(calendar => {
  console.log(`Calendar: ${calendar.calendar}`);
  console.log(`Busy periods: ${calendar.busy.length}`);
  calendar.busy.forEach(period => {
    console.log(`  - ${period.start} to ${period.end}`);
  });
});
```

## Integration with Podcast Generator

```typescript
import { googleCalendarService } from './services/calendar/calendar.service';
import {
  filterTodayEvents,
  filterTomorrowEvents,
  generateDailySummary,
  summarizeEvent,
  determineEventPriority,
} from './services/calendar/calendar.utils';

async function generatePodcastCalendarContent(userId: string) {
  // 1. Fetch events
  const events = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

  // 2. Split by day
  const todayEvents = filterTodayEvents(events);
  const tomorrowEvents = filterTomorrowEvents(events);

  // 3. Generate summaries
  const todaySummary = generateDailySummary(todayEvents);
  const tomorrowSummary = generateDailySummary(tomorrowEvents);

  // 4. Prepare content for AI
  const calendarContent = {
    today: {
      total_events: todaySummary.total_events,
      important_events: todaySummary.important_events.map(e => summarizeEvent(e)),
      next_event: todayEvents.length > 0 ? summarizeEvent(todayEvents[0]) : null,
      free_time: todaySummary.free_time_blocks.map(block =>
        `${block.duration_minutes} minute block`
      ),
    },
    tomorrow: {
      total_events: tomorrowSummary.total_events,
      highlights: tomorrowEvents
        .filter(e => determineEventPriority(e) === 'high')
        .map(e => summarizeEvent(e))
        .slice(0, 3),
    },
  };

  return calendarContent;
}
```

## Error Handling

The service handles various error scenarios:

### No Authentication
```typescript
try {
  const events = await googleCalendarService.fetchTodayEvents(userId);
} catch (error) {
  // Error: "No Google authentication found for user"
}
```

### Token Expired
```typescript
// Automatically handled by tokenManager
// Token is refreshed transparently
```

### Rate Limit Exceeded
```typescript
// Google Calendar API quota: 1,000,000 queries/day
// For most podcast use cases, this is more than sufficient
```

### Invalid Calendar ID
```typescript
try {
  const events = await googleCalendarService.searchEvents(userId, 'query');
} catch (error) {
  // Error: "Failed to search calendar events: ..."
}
```

## Performance Considerations

### API Quota

Google Calendar API quotas:
- **Queries per day**: 1,000,000
- **Queries per user per second**: 5

For podcast briefings:
- Typical daily usage: 1-3 queries per user per day
- Well within quota limits

### Caching (TODO)

Consider implementing caching for:
- Event lists (5-minute TTL)
- Daily summaries (1-hour TTL)
- Calendar lists (24-hour TTL)

Example with Redis:
```typescript
const cacheKey = `calendar:${userId}:today`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const events = await googleCalendarService.fetchTodayEvents(userId);
await redis.setex(cacheKey, 300, JSON.stringify(events));
return events;
```

### Optimization Tips

1. **Fetch only needed time ranges**
   ```typescript
   // Good: Fetch only today and tomorrow
   fetchTodayAndTomorrowEvents(userId);

   // Avoid: Fetch entire week if not needed
   fetchUpcomingEvents(userId, 7);
   ```

2. **Use appropriate max results**
   ```typescript
   // Service default is 250 events
   // For most daily schedules, this is sufficient
   ```

3. **Leverage free/busy for availability checks**
   ```typescript
   // More efficient than fetching full event details
   const freeBusy = await getFreeBusy(userId, start, end);
   ```

## Security Considerations

### OAuth Tokens
- Tokens managed by `tokenManager`
- Automatic refresh before expiry
- Stored encrypted in database (TODO)

### Data Privacy
- Only fetch from user's own calendar
- Attendee emails extracted but not logged
- Event descriptions limited to preview

### Scope Limitations
- Request minimal scopes: `calendar.readonly`
- No write permissions required for briefings

## Troubleshooting

### Issue: "No Google authentication found"
**Solution:** User needs to complete OAuth flow first
```bash
curl http://localhost:3000/api/auth/oauth/google
```

### Issue: Empty results
**Possible causes:**
- No events in time range
- Time range too narrow
- Calendar is empty

**Debug:**
```typescript
// Check calendar list
const calendars = await googleCalendarService.getCalendarList(userId);
console.log('Available calendars:', calendars);

// Try wider time range
const events = await googleCalendarService.fetchUpcomingEvents(userId, 30);
console.log('Events in next 30 days:', events.length);
```

### Issue: Recurring events not showing
**Solution:** Service automatically expands recurring events with `singleEvents: true`

### Issue: Time zones are wrong
**Current:** Service uses UTC times
**TODO:** Implement timezone conversion based on user preferences

## Best Practices

1. **Use appropriate time ranges**
   ```typescript
   // Daily briefing: today + tomorrow
   fetchTodayAndTomorrowEvents(userId);

   // Weekly digest: next 7 days
   fetchUpcomingEvents(userId, 7);
   ```

2. **Handle empty schedules gracefully**
   ```typescript
   const events = await googleCalendarService.fetchTodayEvents(userId);
   if (events.length === 0) {
     return "You have a free day ahead!";
   }
   ```

3. **Check for conflicts**
   ```typescript
   const conflicts = findScheduleConflicts(events);
   if (conflicts.length > 0) {
     // Alert user about overlapping events
   }
   ```

4. **Prioritize important events**
   ```typescript
   const important = events.filter(e =>
     determineEventPriority(e) === EventPriority.HIGH
   );
   ```

5. **Provide context with time descriptions**
   ```typescript
   const timeDesc = getTimeDescription(event.start_time);
   // "starting now", "in 2 hours", "tomorrow at 3 PM"
   ```

## Future Enhancements

- [ ] Timezone conversion based on user preferences
- [ ] Multiple calendar support (not just primary)
- [ ] Event modification/creation (requires write scope)
- [ ] Smart meeting preparation reminders
- [ ] Travel time calculation between events
- [ ] Weather integration for event locations
- [ ] Automatic meeting notes retrieval
- [ ] Video meeting link extraction
- [ ] Attendee response tracking
- [ ] Calendar analytics and insights

## References

- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Calendar API Quotas](https://developers.google.com/calendar/api/guides/quota)
- [Event Resource](https://developers.google.com/calendar/api/v3/reference/events)
- [FreeBusy Query](https://developers.google.com/calendar/api/v3/reference/freebusy/query)
