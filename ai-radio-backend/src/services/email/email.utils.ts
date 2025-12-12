/**
 * Email Utilities
 * Helper functions for email processing, filtering, and analysis
 */

import type { EmailMessage } from '../../types/email';

/**
 * Email priority levels
 */
export enum EmailPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Email categories for classification
 */
export enum EmailCategory {
  PERSONAL = 'personal',
  WORK = 'work',
  AUTOMATED = 'automated',
  NEWSLETTER = 'newsletter',
  NOTIFICATION = 'notification',
  PROMOTIONAL = 'promotional',
  SOCIAL = 'social',
  UNKNOWN = 'unknown',
}

/**
 * Determine email priority based on multiple signals
 */
export function determineEmailPriority(email: EmailMessage): EmailPriority {
  let score = 0;

  // Important flag from provider
  if (email.is_important) {
    score += 3;
  }

  // Check for urgent keywords in subject
  const urgentKeywords = [
    'urgent',
    'important',
    'asap',
    'critical',
    'immediate',
    'action required',
    'deadline',
    'expires',
  ];

  const subjectLower = email.subject.toLowerCase();
  if (urgentKeywords.some(keyword => subjectLower.includes(keyword))) {
    score += 2;
  }

  // Check sender domain
  const senderDomain = email.from.split('@')[1]?.toLowerCase();
  const importantDomains = [
    'company.com', // TODO: Replace with actual company domain
    // Add more important domains
  ];

  if (senderDomain && importantDomains.includes(senderDomain)) {
    score += 2;
  }

  // Check for question marks (might need response)
  if (email.subject.includes('?')) {
    score += 1;
  }

  // Determine priority based on score
  if (score >= 4) return EmailPriority.HIGH;
  if (score >= 2) return EmailPriority.MEDIUM;
  return EmailPriority.LOW;
}

/**
 * Categorize email based on content and metadata
 */
export function categorizeEmail(email: EmailMessage): EmailCategory {
  const from = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();
  const snippet = email.snippet.toLowerCase();
  const labels = email.labels.map(l => l.toLowerCase());

  // Check labels first
  if (labels.includes('category_promotions')) return EmailCategory.PROMOTIONAL;
  if (labels.includes('category_social')) return EmailCategory.SOCIAL;
  if (labels.includes('category_updates')) return EmailCategory.NOTIFICATION;

  // Check for automated emails
  const automatedPatterns = [
    'noreply',
    'no-reply',
    'donotreply',
    'automated',
    'notification',
    'alert',
  ];

  if (automatedPatterns.some(pattern => from.includes(pattern))) {
    return EmailCategory.AUTOMATED;
  }

  // Check for newsletters
  const newsletterKeywords = [
    'unsubscribe',
    'newsletter',
    'weekly digest',
    'update',
    'subscription',
  ];

  if (newsletterKeywords.some(keyword => snippet.includes(keyword))) {
    return EmailCategory.NEWSLETTER;
  }

  // Check for social media notifications
  const socialDomains = [
    'twitter.com',
    'facebook.com',
    'linkedin.com',
    'instagram.com',
    'reddit.com',
  ];

  const senderDomain = from.split('@')[1];
  if (senderDomain && socialDomains.some(domain => senderDomain.includes(domain))) {
    return EmailCategory.SOCIAL;
  }

  // Check for promotional
  const promoKeywords = [
    'sale',
    'discount',
    'offer',
    'deal',
    'promo',
    'limited time',
    'save',
    'shop',
  ];

  if (promoKeywords.some(keyword => subject.includes(keyword))) {
    return EmailCategory.PROMOTIONAL;
  }

  // Default to work if appears to be from organization
  if (senderDomain && !senderDomain.includes('gmail') && !senderDomain.includes('yahoo')) {
    return EmailCategory.WORK;
  }

  // Default to personal
  return EmailCategory.PERSONAL;
}

/**
 * Filter out emails that shouldn't be included in briefing
 */
export function shouldIncludeInBriefing(email: EmailMessage): boolean {
  const category = categorizeEmail(email);

  // Exclude categories
  const excludedCategories = [
    EmailCategory.PROMOTIONAL,
    EmailCategory.SOCIAL,
    EmailCategory.NEWSLETTER,
  ];

  if (excludedCategories.includes(category)) {
    return false;
  }

  // Exclude automated notifications unless important
  if (category === EmailCategory.AUTOMATED && !email.is_important) {
    return false;
  }

  // Exclude if subject suggests automated notification
  const automatedSubjectPatterns = [
    /^re:/i, // Replies (unless important)
    /^fwd:/i, // Forwards (unless important)
    /^\[.*\] /i, // Automated tags like [GitHub]
  ];

  if (!email.is_important) {
    for (const pattern of automatedSubjectPatterns) {
      if (pattern.test(email.subject)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Extract action items from email
 */
export function extractActionItems(email: EmailMessage): string[] {
  const actionItems: string[] = [];
  const text = `${email.subject} ${email.snippet} ${email.body_preview}`;

  // Look for common action patterns
  const actionPatterns = [
    /please (review|check|approve|sign|confirm|verify|update)/gi,
    /need (you to|your|an?) (review|approval|signature|confirmation|response|update)/gi,
    /can you (please )?(review|check|approve|sign|confirm|verify|update)/gi,
    /action required:/gi,
    /deadline:/gi,
    /due (by|on|date):/gi,
  ];

  for (const pattern of actionPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => {
        if (!actionItems.includes(match)) {
          actionItems.push(match);
        }
      });
    }
  }

  return actionItems.slice(0, 3); // Limit to 3 action items
}

/**
 * Summarize email for briefing
 */
export function summarizeEmail(email: EmailMessage): string {
  const category = categorizeEmail(email);
  const priority = determineEmailPriority(email);

  let summary = `From ${email.from.split('@')[0]}`;

  // Add priority indicator
  if (priority === EmailPriority.HIGH) {
    summary = `[URGENT] ${summary}`;
  }

  // Add subject
  summary += `: ${email.subject}`;

  // Add snippet preview
  const previewLength = 100;
  if (email.snippet && email.snippet.length > 0) {
    const preview = email.snippet.substring(0, previewLength);
    summary += ` - ${preview}${email.snippet.length > previewLength ? '...' : ''}`;
  }

  return summary;
}

/**
 * Group emails by sender
 */
export function groupEmailsBySender(emails: EmailMessage[]): Map<string, EmailMessage[]> {
  const grouped = new Map<string, EmailMessage[]>();

  emails.forEach(email => {
    const sender = email.from;
    if (!grouped.has(sender)) {
      grouped.set(sender, []);
    }
    grouped.get(sender)!.push(email);
  });

  return grouped;
}

/**
 * Group emails by category
 */
export function groupEmailsByCategory(emails: EmailMessage[]): Map<EmailCategory, EmailMessage[]> {
  const grouped = new Map<EmailCategory, EmailMessage[]>();

  emails.forEach(email => {
    const category = categorizeEmail(email);
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(email);
  });

  return grouped;
}

/**
 * Get email statistics
 */
export function getEmailStatistics(emails: EmailMessage[]): {
  total: number;
  important: number;
  byPriority: Record<EmailPriority, number>;
  byCategory: Record<EmailCategory, number>;
  unreadCount: number;
  withActionItems: number;
} {
  const stats = {
    total: emails.length,
    important: 0,
    byPriority: {
      [EmailPriority.HIGH]: 0,
      [EmailPriority.MEDIUM]: 0,
      [EmailPriority.LOW]: 0,
    },
    byCategory: {
      [EmailCategory.PERSONAL]: 0,
      [EmailCategory.WORK]: 0,
      [EmailCategory.AUTOMATED]: 0,
      [EmailCategory.NEWSLETTER]: 0,
      [EmailCategory.NOTIFICATION]: 0,
      [EmailCategory.PROMOTIONAL]: 0,
      [EmailCategory.SOCIAL]: 0,
      [EmailCategory.UNKNOWN]: 0,
    },
    unreadCount: 0,
    withActionItems: 0,
  };

  emails.forEach(email => {
    if (email.is_important) stats.important++;

    const priority = determineEmailPriority(email);
    stats.byPriority[priority]++;

    const category = categorizeEmail(email);
    stats.byCategory[category]++;

    if (email.labels.includes('UNREAD')) stats.unreadCount++;

    const actionItems = extractActionItems(email);
    if (actionItems.length > 0) stats.withActionItems++;
  });

  return stats;
}

/**
 * Filter emails for podcast briefing
 * Returns the most relevant emails sorted by importance
 */
export function filterForBriefing(
  emails: EmailMessage[],
  maxEmails: number = 10
): EmailMessage[] {
  // Filter out emails that shouldn't be included
  const relevant = emails.filter(shouldIncludeInBriefing);

  // Sort by priority and recency
  const sorted = relevant.sort((a, b) => {
    const priorityA = determineEmailPriority(a);
    const priorityB = determineEmailPriority(b);

    // Priority weight
    const priorityWeight = {
      [EmailPriority.HIGH]: 3,
      [EmailPriority.MEDIUM]: 2,
      [EmailPriority.LOW]: 1,
    };

    const scoreA = priorityWeight[priorityA];
    const scoreB = priorityWeight[priorityB];

    if (scoreA !== scoreB) {
      return scoreB - scoreA; // Higher priority first
    }

    // If same priority, sort by date (newer first)
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
  });

  // Return top N emails
  return sorted.slice(0, maxEmails);
}

/**
 * Format email for display
 */
export function formatEmailForDisplay(email: EmailMessage): string {
  const priority = determineEmailPriority(email);
  const category = categorizeEmail(email);
  const actionItems = extractActionItems(email);

  let formatted = '';

  // Priority badge
  if (priority === EmailPriority.HIGH) {
    formatted += '[HIGH PRIORITY] ';
  }

  // Sender
  formatted += `From: ${email.from}\n`;

  // Subject
  formatted += `Subject: ${email.subject}\n`;

  // Category
  formatted += `Category: ${category}\n`;

  // Received time
  const receivedDate = new Date(email.received_at);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60));

  if (diffHours < 1) {
    formatted += 'Received: Just now\n';
  } else if (diffHours < 24) {
    formatted += `Received: ${diffHours} hour${diffHours > 1 ? 's' : ''} ago\n`;
  } else {
    formatted += `Received: ${receivedDate.toLocaleDateString()}\n`;
  }

  // Preview
  if (email.snippet) {
    formatted += `\nPreview: ${email.snippet.substring(0, 150)}...\n`;
  }

  // Action items
  if (actionItems.length > 0) {
    formatted += '\nAction Items:\n';
    actionItems.forEach(item => {
      formatted += `  - ${item}\n`;
    });
  }

  return formatted;
}

/**
 * Check if email is likely spam/phishing
 */
export function isPotentialSpam(email: EmailMessage): boolean {
  const subject = email.subject.toLowerCase();
  const from = email.from.toLowerCase();
  const snippet = email.snippet.toLowerCase();

  // Spam keywords
  const spamKeywords = [
    'congratulations! you won',
    'click here now',
    'limited time offer',
    'act now',
    'buy now',
    'risk-free',
    'this is not spam',
    'earn money',
    'work from home',
    'nigerian prince',
  ];

  if (spamKeywords.some(keyword => subject.includes(keyword) || snippet.includes(keyword))) {
    return true;
  }

  // Suspicious sender patterns
  if (from.includes('noreply') && subject.includes('verify your account')) {
    return true;
  }

  return false;
}

export default {
  determineEmailPriority,
  categorizeEmail,
  shouldIncludeInBriefing,
  extractActionItems,
  summarizeEmail,
  groupEmailsBySender,
  groupEmailsByCategory,
  getEmailStatistics,
  filterForBriefing,
  formatEmailForDisplay,
  isPotentialSpam,
  EmailPriority,
  EmailCategory,
};
