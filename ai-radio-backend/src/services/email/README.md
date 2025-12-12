# Email Services

Email integration services for Gmail, providing email fetching, parsing, and intelligent filtering for podcast briefings.

## Files

### `gmail.service.ts`
Complete Gmail API integration for fetching and parsing emails.

**Features:**
- ✅ Fetch recent emails with smart filtering
- ✅ Automatic OAuth token management and refresh
- ✅ Batch processing with rate limiting
- ✅ HTML to plain text conversion
- ✅ Email importance detection
- ✅ Label and category filtering
- ✅ Unread count tracking
- ✅ Search functionality
- ✅ Mark as read capability

**Key Methods:**
```typescript
// Fetch recent emails
const emails = await gmailService.fetchEmails(userId, {
  max_results: 50,
  since_hours: 24,
  labels: ['inbox'],
  exclude_categories: ['promotions', 'social']
});

// Get unread count
const count = await gmailService.getUnreadCount(userId);

// Search emails
const results = await gmailService.searchEmails(userId, 'from:boss@company.com');

// Mark as read
await gmailService.markAsRead(userId, messageId);
```

### `email.utils.ts`
Utility functions for email analysis, filtering, and categorization.

**Features:**
- ✅ Priority determination (high/medium/low)
- ✅ Category classification (work/personal/automated/etc.)
- ✅ Action item extraction
- ✅ Spam/phishing detection
- ✅ Email grouping and statistics
- ✅ Briefing-ready filtering
- ✅ Summary generation

**Key Functions:**
```typescript
import {
  determineEmailPriority,
  categorizeEmail,
  filterForBriefing,
  getEmailStatistics,
  extractActionItems,
} from './email.utils';

// Determine priority
const priority = determineEmailPriority(email);
// Returns: 'high' | 'medium' | 'low'

// Categorize
const category = categorizeEmail(email);
// Returns: 'work' | 'personal' | 'automated' | etc.

// Filter for briefing (top 10 most relevant)
const briefingEmails = filterForBriefing(emails, 10);

// Get statistics
const stats = getEmailStatistics(emails);
// Returns counts by priority, category, action items, etc.

// Extract action items
const actions = extractActionItems(email);
// Returns: ['please review', 'deadline: friday', ...]
```

## Email Processing Pipeline

```
┌─────────────────────────────────────────────────────────┐
│              Email Fetching & Processing                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Get OAuth Token (auto-refresh if needed)            │
│           ↓                                              │
│  2. Build Gmail Query (filters, labels, time range)     │
│           ↓                                              │
│  3. Fetch Message IDs (paginated)                       │
│           ↓                                              │
│  4. Fetch Full Messages (batched)                       │
│           ↓                                              │
│  5. Parse & Extract (headers, body, metadata)           │
│           ↓                                              │
│  6. Determine Importance (labels, keywords, sender)     │
│           ↓                                              │
│  7. Categorize (work, personal, automated, etc.)        │
│           ↓                                              │
│  8. Extract Action Items (keywords, patterns)           │
│           ↓                                              │
│  9. Filter for Briefing (relevance scoring)             │
│           ↓                                              │
│  10. Return EmailMessage[]                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```typescript
// 1. User makes request
const userId = 'user@example.com';

// 2. Service fetches emails
const emails = await gmailService.fetchEmails(userId, {
  max_results: 50,
  since_hours: 24,
});
// Returns: EmailMessage[]

// 3. Filter for briefing
const briefingEmails = filterForBriefing(emails, 10);

// 4. Get statistics
const stats = getEmailStatistics(briefingEmails);
// {
//   total: 10,
//   important: 3,
//   byPriority: { high: 3, medium: 5, low: 2 },
//   byCategory: { work: 7, personal: 3 },
//   withActionItems: 4
// }

// 5. Generate summaries
const summaries = briefingEmails.map(email => ({
  summary: summarizeEmail(email),
  priority: determineEmailPriority(email),
  actionItems: extractActionItems(email)
}));
```

## Gmail API Features

### Query Building

The service automatically builds intelligent Gmail queries:

```typescript
// Default query (last 24 hours, inbox only, exclude promotions/social)
in:inbox after:1234567890 -category:promotions -category:social -in:spam -in:trash

// With custom labels
(in:inbox OR label:important) after:1234567890 -category:promotions

// Time-based
after:1704067200  // Unix timestamp for date filtering
```

### Rate Limiting

Gmail API has a quota of **250 units/second**:
- `list`: 5 units
- `get`: 5 units

The service implements:
- Batch processing (50 messages per batch)
- 100ms delay between batches
- Parallel fetching within batches
- Graceful error handling

### Message Parsing

Extracts from Gmail's complex format:

```typescript
{
  id: string;                    // Gmail message ID
  from: string;                  // Parsed email address
  subject: string;               // Subject line
  snippet: string;               // Gmail's auto-generated snippet
  body_preview: string;          // First 500 chars of body (HTML stripped)
  received_at: string;           // ISO date string
  is_important: boolean;         // Determined from labels/headers
  labels: string[];              // Gmail label IDs
  source: 'gmail';               // Always 'gmail'
}
```

## Email Categories

### Automatic Classification

| Category | Detection Criteria |
|----------|-------------------|
| **Work** | From company domain, business content |
| **Personal** | From personal email addresses |
| **Automated** | From noreply@, contains "automated" |
| **Newsletter** | Contains "unsubscribe", "newsletter" |
| **Notification** | Has CATEGORY_UPDATES label |
| **Promotional** | Has CATEGORY_PROMOTIONS label |
| **Social** | From social media domains |

### Priority Determination

Priority is calculated based on multiple signals:

| Signal | Score |
|--------|-------|
| Gmail IMPORTANT label | +3 |
| Urgent keywords in subject | +2 |
| From important domain | +2 |
| Contains question mark | +1 |

**Scoring:**
- Score ≥ 4: **High Priority**
- Score 2-3: **Medium Priority**
- Score 0-1: **Low Priority**

### Briefing Filter

Emails are excluded from briefing if:
- Category is promotional, social, or newsletter
- Automated notification (unless marked important)
- Subject matches automated patterns (`^[GITHUB]`, etc.)
- Detected as potential spam/phishing

## Usage Examples

### Basic Email Fetching

```typescript
import { gmailService } from './gmail.service';

// Fetch last 24 hours
const emails = await gmailService.fetchEmails('user@example.com', {
  max_results: 100,
  since_hours: 24,
});

console.log(`Fetched ${emails.length} emails`);
```

### Filtered Fetch

```typescript
// Only important emails from last 12 hours
const important = await gmailService.fetchEmails('user@example.com', {
  max_results: 50,
  since_hours: 12,
  labels: ['important', 'starred'],
});
```

### Custom Search

```typescript
// Search for specific emails
const results = await gmailService.searchEmails(
  'user@example.com',
  'from:boss@company.com subject:urgent',
  20
);
```

### Generate Briefing

```typescript
import { filterForBriefing, summarizeEmail } from './email.utils';

// 1. Fetch emails
const emails = await gmailService.fetchEmails(userId, {
  max_results: 100,
  since_hours: 24,
});

// 2. Filter to most relevant 10
const briefing = filterForBriefing(emails, 10);

// 3. Generate summaries
const summaries = briefing.map(email => ({
  from: email.from,
  subject: email.subject,
  summary: summarizeEmail(email),
  priority: determineEmailPriority(email),
  actionItems: extractActionItems(email),
}));

// 4. Use in podcast script
summaries.forEach(({ summary, priority, actionItems }) => {
  if (priority === 'high') {
    console.log(`[URGENT] ${summary}`);
  } else {
    console.log(summary);
  }

  if (actionItems.length > 0) {
    console.log('  Action needed:', actionItems.join(', '));
  }
});
```

### Get Statistics

```typescript
import { getEmailStatistics } from './email.utils';

const stats = getEmailStatistics(emails);

console.log(`
Total emails: ${stats.total}
Important: ${stats.important}
High priority: ${stats.byPriority.high}
Work emails: ${stats.byCategory.work}
With action items: ${stats.withActionItems}
`);
```

### Group by Sender

```typescript
import { groupEmailsBySender } from './email.utils';

const grouped = groupEmailsBySender(emails);

grouped.forEach((senderEmails, sender) => {
  console.log(`${sender}: ${senderEmails.length} emails`);
});
```

## Integration with Podcast Generator

```typescript
import { gmailService } from './services/email/gmail.service';
import { filterForBriefing, getEmailStatistics } from './services/email/email.utils';

async function generatePodcastContent(userId: string) {
  // 1. Fetch emails
  const emails = await gmailService.fetchEmails(userId, {
    max_results: 100,
    since_hours: 24,
    exclude_categories: ['promotions', 'social', 'updates'],
  });

  // 2. Filter for briefing
  const briefingEmails = filterForBriefing(emails, 10);

  // 3. Get statistics for intro
  const stats = getEmailStatistics(briefingEmails);

  // 4. Prepare content for AI
  const emailContent = {
    total: stats.total,
    important: stats.important,
    highlights: briefingEmails
      .filter(e => determineEmailPriority(e) === 'high')
      .map(e => ({
        from: e.from,
        subject: e.subject,
        snippet: e.snippet,
      })),
    actionItems: briefingEmails
      .flatMap(e => extractActionItems(e))
      .slice(0, 5),
  };

  return emailContent;
}
```

## Error Handling

The service handles various error scenarios:

### No Authentication
```typescript
try {
  const emails = await gmailService.fetchEmails(userId, options);
} catch (error) {
  // Error: "No Gmail authentication found for user"
}
```

### Token Expired
```typescript
// Automatically handled by tokenManager
// Token is refreshed transparently
```

### Rate Limit Exceeded
```typescript
// Service automatically batches and delays requests
// Individual message failures don't break entire fetch
```

### Invalid Query
```typescript
try {
  const results = await gmailService.searchEmails(userId, 'invalid:query');
} catch (error) {
  // Error: "Failed to search emails: Invalid query"
}
```

## Performance Considerations

### Batch Size
- Default: 50 messages per batch
- Adjustable via `BATCH_SIZE` constant
- Smaller batches = slower but more reliable
- Larger batches = faster but may hit rate limits

### Caching (TODO)
Consider implementing caching for:
- Message lists (5-minute TTL)
- Full message content (1-hour TTL)
- Unread counts (1-minute TTL)

Example with Redis:
```typescript
const cacheKey = `emails:${userId}:24h`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const emails = await gmailService.fetchEmails(userId, options);
await redis.setex(cacheKey, 300, JSON.stringify(emails));
return emails;
```

### Pagination (TODO)
For very large email volumes:
```typescript
async function *fetchAllEmails(userId: string, options: EmailFetchOptions) {
  let pageToken: string | undefined;

  do {
    const { emails, nextPageToken } = await gmailService.fetchEmailsWithPagination(
      userId,
      options,
      pageToken
    );

    yield emails;
    pageToken = nextPageToken;
  } while (pageToken);
}
```

## Testing

### Manual Testing

```typescript
// Test OAuth connection
const emails = await gmailService.fetchEmails('test@example.com', {
  max_results: 5,
  since_hours: 24,
});

console.log(`Fetched ${emails.length} emails`);
emails.forEach(email => {
  console.log(`- ${email.from}: ${email.subject}`);
});
```

### Unit Testing (TODO)

```typescript
import { describe, it, expect, vi } from 'vitest';
import { gmailService } from './gmail.service';

describe('GmailService', () => {
  it('should fetch emails', async () => {
    // Mock Gmail API
    const mockGmail = vi.fn();
    // ...test implementation
  });

  it('should parse messages correctly', () => {
    const message = createMockGmailMessage();
    const parsed = gmailService['parseGmailMessage'](message);
    expect(parsed).toMatchObject({
      source: 'gmail',
      from: expect.any(String),
      subject: expect.any(String),
    });
  });
});
```

## Security Considerations

### OAuth Tokens
- Tokens managed by `tokenManager`
- Automatic refresh before expiry
- Stored encrypted in database (TODO)

### Data Privacy
- Email content never logged
- Only metadata used for statistics
- Body previews limited to 500 characters

### Rate Limiting
- Respects Gmail API limits
- Implements delays between batches
- Graceful degradation on errors

## Troubleshooting

### Issue: "No Gmail authentication found"
**Solution:** User needs to complete OAuth flow first
```bash
curl http://localhost:3000/api/auth/oauth/google
```

### Issue: Empty results
**Possible causes:**
- No emails match filters
- Time range too narrow
- All emails excluded by category filters

**Debug:**
```typescript
const unfiltered = await gmailService.fetchEmails(userId, {
  max_results: 100,
  since_hours: 168, // 1 week
  exclude_categories: [], // Don't exclude anything
});
```

### Issue: Slow performance
**Solutions:**
- Reduce `max_results`
- Narrow time range (`since_hours`)
- Implement caching
- Use smaller batch sizes

## Best Practices

1. **Always set reasonable limits**
   ```typescript
   max_results: 100 // Don't fetch 1000s of emails
   ```

2. **Use appropriate time ranges**
   ```typescript
   since_hours: 24 // Last day for daily briefing
   since_hours: 168 // Last week for weekly digest
   ```

3. **Filter early**
   ```typescript
   exclude_categories: ['promotions', 'social', 'updates']
   ```

4. **Handle errors gracefully**
   ```typescript
   try {
     const emails = await gmailService.fetchEmails(userId, options);
   } catch (error) {
     // Fallback to cached data or skip email section
   }
   ```

5. **Monitor rate limits**
   - Log API call counts
   - Track quota usage
   - Implement backoff if needed

## Future Enhancements

- [ ] Implement caching layer (Redis)
- [ ] Add pagination support
- [ ] Support for attachments metadata
- [ ] Thread conversation grouping
- [ ] Smart reply suggestions
- [ ] Sentiment analysis
- [ ] Automatic categorization training
- [ ] Multi-language support
- [ ] Email templates detection
- [ ] Calendar invite extraction

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Gmail API Quotas](https://developers.google.com/gmail/api/reference/quota)
- [Search Operators](https://support.google.com/mail/answer/7190)
