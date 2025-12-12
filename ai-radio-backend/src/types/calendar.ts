/**
 * Calendar Type Definitions
 * Types for calendar integration (Google Calendar & Outlook Calendar)
 */

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  attendees: string[];
  is_all_day: boolean;
  source: 'google' | 'outlook';
}

export interface CalendarFetchOptions {
  days_ahead: number;
  include_past_today: boolean;
}

// Google Calendar-specific types
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }>;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

// Outlook Calendar-specific types
export interface OutlookCalendarEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  location?: {
    displayName: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
    };
  }>;
  isAllDay: boolean;
  isCancelled: boolean;
}

// Processed calendar types
export interface ProcessedCalendarEvent {
  summary: string;
  time_description: string; // e.g., "in 2 hours", "tomorrow at 3pm"
  priority: 'low' | 'medium' | 'high';
  requires_preparation: boolean;
}

export interface DailyScheduleSummary {
  total_events: number;
  busy_periods: Array<{
    start: string;
    end: string;
  }>;
  important_events: CalendarEvent[];
  free_time_blocks: Array<{
    start: string;
    end: string;
    duration_minutes: number;
  }>;
}

// TODO: Implement rate limiting for Google Calendar API
// TODO: Implement throttling handling for Microsoft Graph API
// TODO: Add timezone conversion based on user preferences
// TODO: Implement smart event prioritization based on attendees, recurrence, etc.
