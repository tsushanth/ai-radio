/**
 * Calendar Utilities
 * Helper functions for calendar event processing, analysis, and formatting
 */

import type {
  CalendarEvent,
  ProcessedCalendarEvent,
  DailyScheduleSummary,
} from '../../types/calendar';

/**
 * Event priority levels based on various signals
 */
export enum EventPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/**
 * Determine event priority based on multiple factors
 */
export function determineEventPriority(event: CalendarEvent): EventPriority {
  let score = 0;

  // Check number of attendees (meetings with many people are usually important)
  if (event.attendees.length >= 5) {
    score += 2;
  } else if (event.attendees.length >= 2) {
    score += 1;
  }

  // Check for priority keywords in title
  const priorityKeywords = [
    'urgent',
    'important',
    'critical',
    'executive',
    'board',
    'review',
    'presentation',
    'demo',
    'interview',
    'deadline',
  ];

  const titleLower = event.title.toLowerCase();
  if (priorityKeywords.some(keyword => titleLower.includes(keyword))) {
    score += 2;
  }

  // Check for 1:1 meetings (usually important)
  if (event.attendees.length === 1) {
    score += 1;
  }

  // All-day events are usually less urgent
  if (event.is_all_day) {
    score -= 1;
  }

  // Events with locations (in-person) are often more important
  if (event.location && !event.location.toLowerCase().includes('zoom')) {
    score += 1;
  }

  // Determine priority based on score
  if (score >= 3) return EventPriority.HIGH;
  if (score >= 1) return EventPriority.MEDIUM;
  return EventPriority.LOW;
}

/**
 * Check if event requires preparation
 */
export function requiresPreparation(event: CalendarEvent): boolean {
  const prepKeywords = [
    'presentation',
    'demo',
    'review',
    'interview',
    'pitch',
    'proposal',
    'meeting',
    'standup',
    'sync',
  ];

  const titleLower = event.title.toLowerCase();
  return prepKeywords.some(keyword => titleLower.includes(keyword));
}

/**
 * Generate human-readable time description
 */
export function getTimeDescription(startTime: string, currentTime: Date = new Date()): string {
  const start = new Date(startTime);
  const diffMs = start.getTime() - currentTime.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Past event
  if (diffMs < 0) {
    return 'ongoing or passed';
  }

  // Within the next hour
  if (diffMinutes < 60) {
    if (diffMinutes <= 5) {
      return 'starting now';
    }
    return `in ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
  }

  // Within today
  if (diffHours < 24 && start.getDate() === currentTime.getDate()) {
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');

    if (diffHours < 3) {
      return `in ${diffHours} hour${diffHours > 1 ? 's' : ''} (${displayHours}:${displayMinutes} ${ampm})`;
    }
    return `today at ${displayHours}:${displayMinutes} ${ampm}`;
  }

  // Tomorrow
  if (diffDays === 0 && start.getDate() === currentTime.getDate() + 1) {
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `tomorrow at ${displayHours}:${displayMinutes} ${ampm}`;
  }

  // This week
  if (diffDays <= 7) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[start.getDay()];
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${dayName} at ${displayHours}:${displayMinutes} ${ampm}`;
  }

  // Future date
  return start.toLocaleDateString();
}

/**
 * Calculate event duration in minutes
 */
export function getEventDuration(event: CalendarEvent): number {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Format duration for display
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

/**
 * Process event for podcast briefing
 */
export function processEventForBriefing(event: CalendarEvent): ProcessedCalendarEvent {
  return {
    summary: event.title,
    time_description: getTimeDescription(event.start_time),
    priority: determineEventPriority(event),
    requires_preparation: requiresPreparation(event),
  };
}

/**
 * Group events by day
 */
export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();

  events.forEach(event => {
    const date = new Date(event.start_time);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  });

  return grouped;
}

/**
 * Filter events happening today
 */
export function filterTodayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  return events.filter(event => {
    const start = new Date(event.start_time);
    return start >= todayStart && start <= todayEnd;
  });
}

/**
 * Filter events happening tomorrow
 */
export function filterTomorrowEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);

  return events.filter(event => {
    const start = new Date(event.start_time);
    return start >= tomorrowStart && start <= tomorrowEnd;
  });
}

/**
 * Filter upcoming events (happening soon)
 */
export function filterUpcomingEvents(
  events: CalendarEvent[],
  withinHours: number = 2
): CalendarEvent[] {
  const now = new Date();
  const threshold = new Date(now.getTime() + withinHours * 60 * 60 * 1000);

  return events.filter(event => {
    const start = new Date(event.start_time);
    return start >= now && start <= threshold;
  });
}

/**
 * Calculate free time blocks between events
 */
export function calculateFreeTimeBlocks(
  events: CalendarEvent[],
  dayStart: Date,
  dayEnd: Date,
  minBlockMinutes: number = 30
): Array<{ start: string; end: string; duration_minutes: number }> {
  if (events.length === 0) {
    const duration = Math.floor((dayEnd.getTime() - dayStart.getTime()) / (1000 * 60));
    return [{
      start: dayStart.toISOString(),
      end: dayEnd.toISOString(),
      duration_minutes: duration,
    }];
  }

  // Sort events by start time
  const sortedEvents = [...events].sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  const freeBlocks: Array<{ start: string; end: string; duration_minutes: number }> = [];

  // Check free time before first event
  const firstEventStart = new Date(sortedEvents[0].start_time);
  if (firstEventStart > dayStart) {
    const duration = Math.floor((firstEventStart.getTime() - dayStart.getTime()) / (1000 * 60));
    if (duration >= minBlockMinutes) {
      freeBlocks.push({
        start: dayStart.toISOString(),
        end: firstEventStart.toISOString(),
        duration_minutes: duration,
      });
    }
  }

  // Check free time between events
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEventEnd = new Date(sortedEvents[i].end_time);
    const nextEventStart = new Date(sortedEvents[i + 1].start_time);

    if (nextEventStart > currentEventEnd) {
      const duration = Math.floor((nextEventStart.getTime() - currentEventEnd.getTime()) / (1000 * 60));
      if (duration >= minBlockMinutes) {
        freeBlocks.push({
          start: currentEventEnd.toISOString(),
          end: nextEventStart.toISOString(),
          duration_minutes: duration,
        });
      }
    }
  }

  // Check free time after last event
  const lastEventEnd = new Date(sortedEvents[sortedEvents.length - 1].end_time);
  if (lastEventEnd < dayEnd) {
    const duration = Math.floor((dayEnd.getTime() - lastEventEnd.getTime()) / (1000 * 60));
    if (duration >= minBlockMinutes) {
      freeBlocks.push({
        start: lastEventEnd.toISOString(),
        end: dayEnd.toISOString(),
        duration_minutes: duration,
      });
    }
  }

  return freeBlocks;
}

/**
 * Generate daily schedule summary
 */
export function generateDailySummary(
  events: CalendarEvent[],
  date: Date = new Date()
): DailyScheduleSummary {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

  // Filter events for this day
  const dayEvents = events.filter(event => {
    const start = new Date(event.start_time);
    return start >= dayStart && start <= dayEnd;
  });

  // Calculate busy periods
  const busyPeriods = dayEvents.map(event => ({
    start: event.start_time,
    end: event.end_time,
  }));

  // Get important events
  const importantEvents = dayEvents.filter(
    event => determineEventPriority(event) === EventPriority.HIGH
  );

  // Calculate free time blocks
  const freeTimeBlocks = calculateFreeTimeBlocks(dayEvents, dayStart, dayEnd);

  return {
    total_events: dayEvents.length,
    busy_periods: busyPeriods,
    important_events: importantEvents,
    free_time_blocks: freeTimeBlocks,
  };
}

/**
 * Get calendar statistics
 */
export function getCalendarStatistics(events: CalendarEvent[]): {
  total_events: number;
  by_priority: Record<EventPriority, number>;
  with_attendees: number;
  all_day_events: number;
  total_meeting_minutes: number;
  average_meeting_duration: number;
} {
  const stats = {
    total_events: events.length,
    by_priority: {
      [EventPriority.HIGH]: 0,
      [EventPriority.MEDIUM]: 0,
      [EventPriority.LOW]: 0,
    },
    with_attendees: 0,
    all_day_events: 0,
    total_meeting_minutes: 0,
    average_meeting_duration: 0,
  };

  if (events.length === 0) {
    return stats;
  }

  events.forEach(event => {
    const priority = determineEventPriority(event);
    stats.by_priority[priority]++;

    if (event.attendees.length > 0) {
      stats.with_attendees++;
    }

    if (event.is_all_day) {
      stats.all_day_events++;
    }

    const duration = getEventDuration(event);
    stats.total_meeting_minutes += duration;
  });

  stats.average_meeting_duration = Math.round(stats.total_meeting_minutes / events.length);

  return stats;
}

/**
 * Format event for display
 */
export function formatEventForDisplay(event: CalendarEvent): string {
  const priority = determineEventPriority(event);
  const duration = getEventDuration(event);
  const timeDesc = getTimeDescription(event.start_time);

  let formatted = '';

  // Priority indicator
  if (priority === EventPriority.HIGH) {
    formatted += '[HIGH PRIORITY] ';
  }

  // Title
  formatted += `${event.title}\n`;

  // Time
  formatted += `Time: ${timeDesc}`;
  if (!event.is_all_day) {
    formatted += ` (${formatDuration(duration)})`;
  }
  formatted += '\n';

  // Location
  if (event.location) {
    formatted += `Location: ${event.location}\n`;
  }

  // Attendees
  if (event.attendees.length > 0) {
    formatted += `Attendees: ${event.attendees.length} person${event.attendees.length > 1 ? 's' : ''}\n`;
  }

  // Preparation indicator
  if (requiresPreparation(event)) {
    formatted += 'ℹ️  Preparation recommended\n';
  }

  // Description preview
  if (event.description) {
    const preview = event.description.substring(0, 100);
    formatted += `\nDescription: ${preview}${event.description.length > 100 ? '...' : ''}\n`;
  }

  return formatted;
}

/**
 * Summarize event for podcast briefing
 */
export function summarizeEvent(event: CalendarEvent): string {
  const timeDesc = getTimeDescription(event.start_time);
  const duration = getEventDuration(event);
  const priority = determineEventPriority(event);

  let summary = '';

  if (priority === EventPriority.HIGH) {
    summary += '[IMPORTANT] ';
  }

  summary += `${event.title} ${timeDesc}`;

  if (!event.is_all_day && duration < 480) { // Less than 8 hours
    summary += ` for ${formatDuration(duration)}`;
  }

  if (event.attendees.length > 0) {
    summary += ` with ${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}`;
  }

  if (event.location) {
    summary += ` at ${event.location}`;
  }

  return summary;
}

/**
 * Check if schedule is busy
 */
export function isScheduleBusy(events: CalendarEvent[], threshold: number = 5): boolean {
  return events.length >= threshold;
}

/**
 * Get next event
 */
export function getNextEvent(events: CalendarEvent[]): CalendarEvent | null {
  const now = new Date();
  const upcoming = events.filter(event => new Date(event.start_time) > now);

  if (upcoming.length === 0) {
    return null;
  }

  // Sort by start time and return first
  upcoming.sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  return upcoming[0];
}

/**
 * Check for schedule conflicts (overlapping events)
 */
export function findScheduleConflicts(events: CalendarEvent[]): Array<{
  event1: CalendarEvent;
  event2: CalendarEvent;
}> {
  const conflicts: Array<{ event1: CalendarEvent; event2: CalendarEvent }> = [];

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const event1 = events[i];
      const event2 = events[j];

      const start1 = new Date(event1.start_time);
      const end1 = new Date(event1.end_time);
      const start2 = new Date(event2.start_time);
      const end2 = new Date(event2.end_time);

      // Check for overlap
      if (start1 < end2 && start2 < end1) {
        conflicts.push({ event1, event2 });
      }
    }
  }

  return conflicts;
}

export default {
  determineEventPriority,
  requiresPreparation,
  getTimeDescription,
  getEventDuration,
  formatDuration,
  processEventForBriefing,
  groupEventsByDay,
  filterTodayEvents,
  filterTomorrowEvents,
  filterUpcomingEvents,
  calculateFreeTimeBlocks,
  generateDailySummary,
  getCalendarStatistics,
  formatEventForDisplay,
  summarizeEvent,
  isScheduleBusy,
  getNextEvent,
  findScheduleConflicts,
  EventPriority,
};
