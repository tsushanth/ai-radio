/**
 * Google Calendar Service
 * Fetches and parses calendar events from Google Calendar API
 */

import { google, calendar_v3 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { gmailAuthService } from '../auth/gmail.auth';
import { tokenManager } from '../auth/token.manager';
import type { CalendarEvent, CalendarFetchOptions, GoogleCalendarEvent } from '../../types/calendar';

export class GoogleCalendarService {
  private readonly MAX_RESULTS = 250; // Maximum events per request
  private readonly RATE_LIMIT_DELAY = 100; // ms between API calls

  /**
   * Fetch calendar events for a user
   */
  async fetchEvents(userId: string, options: CalendarFetchOptions): Promise<CalendarEvent[]> {
    try {
      // Get valid access token (auto-refreshes if needed)
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        throw new Error('No Google authentication found for user');
      }

      // Create authenticated Calendar client
      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const calendar = google.calendar({ version: 'v3', auth });

      // Calculate time range
      const timeMin = this.getTimeMin(options.include_past_today);
      const timeMax = this.getTimeMax(options.days_ahead);

      // Fetch events from primary calendar
      const events = await this.fetchCalendarEvents(calendar, timeMin, timeMax);

      if (events.length === 0) {
        return [];
      }

      // Parse events to our standard format
      const parsedEvents = events
        .map(event => this.parseCalendarEvent(event))
        .filter((event): event is CalendarEvent => event !== null);

      // Sort by start time (earliest first)
      parsedEvents.sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );

      return parsedEvents;
    } catch (error) {
      console.error('Failed to fetch Google Calendar events:', error);
      throw this.createError('Failed to fetch calendar events', error);
    }
  }

  /**
   * Fetch today's events
   */
  async fetchTodayEvents(userId: string): Promise<CalendarEvent[]> {
    return this.fetchEvents(userId, {
      days_ahead: 0,
      include_past_today: false,
    });
  }

  /**
   * Fetch today's and tomorrow's events
   */
  async fetchTodayAndTomorrowEvents(userId: string): Promise<CalendarEvent[]> {
    return this.fetchEvents(userId, {
      days_ahead: 1,
      include_past_today: false,
    });
  }

  /**
   * Fetch upcoming events for next N days
   */
  async fetchUpcomingEvents(userId: string, daysAhead: number): Promise<CalendarEvent[]> {
    return this.fetchEvents(userId, {
      days_ahead: daysAhead,
      include_past_today: false,
    });
  }

  /**
   * Get time range start (beginning of today or current time)
   */
  private getTimeMin(includePastToday: boolean): Date {
    const now = new Date();
    if (includePastToday) {
      // Start of today (00:00)
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    }
    // Current time
    return now;
  }

  /**
   * Get time range end
   */
  private getTimeMax(daysAhead: number): Date {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    endDate.setDate(endDate.getDate() + daysAhead);
    return endDate;
  }

  /**
   * Fetch events from Google Calendar API
   */
  private async fetchCalendarEvents(
    calendar: calendar_v3.Calendar,
    timeMin: Date,
    timeMax: Date
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: this.MAX_RESULTS,
        singleEvents: true, // Expand recurring events into individual instances
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      throw this.createError('Failed to fetch calendar events from API', error);
    }
  }

  /**
   * Parse Google Calendar event to our standard CalendarEvent format
   */
  private parseCalendarEvent(event: calendar_v3.Schema$Event): CalendarEvent | null {
    try {
      if (!event.id || !event.start || !event.end) {
        return null;
      }

      // Skip cancelled events
      if (event.status === 'cancelled') {
        return null;
      }

      // Extract start and end times
      const startTime = event.start.dateTime || event.start.date;
      const endTime = event.end.dateTime || event.end.date;

      if (!startTime || !endTime) {
        return null;
      }

      // Determine if all-day event
      const isAllDay = !event.start.dateTime && !!event.start.date;

      // Extract attendees
      const attendees = this.extractAttendees(event);

      return {
        id: event.id,
        title: event.summary || '(No Title)',
        description: event.description || null,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        location: event.location || null,
        attendees,
        is_all_day: isAllDay,
        source: 'google',
      };
    } catch (error) {
      console.error('Failed to parse calendar event:', error);
      return null;
    }
  }

  /**
   * Extract attendee email addresses from event
   */
  private extractAttendees(event: calendar_v3.Schema$Event): string[] {
    if (!event.attendees || event.attendees.length === 0) {
      return [];
    }

    return event.attendees
      .filter(attendee => attendee.email && attendee.responseStatus !== 'declined')
      .map(attendee => attendee.email!)
      .filter(Boolean);
  }

  /**
   * Get calendar list for user
   */
  async getCalendarList(userId: string): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return [];
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.calendarList.list();

      return response.data.items?.map(cal => ({
        id: cal.id || '',
        summary: cal.summary || '',
        primary: cal.primary || false,
      })) || [];
    } catch (error) {
      console.error('Failed to get calendar list:', error);
      return [];
    }
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(
    userId: string,
    timeMin: Date,
    timeMax: Date,
    calendarIds: string[] = ['primary']
  ): Promise<Array<{ calendar: string; busy: Array<{ start: string; end: string }> }>> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return [];
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.freebusy.query({
        requestBody: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          items: calendarIds.map(id => ({ id })),
        },
      });

      const result: Array<{ calendar: string; busy: Array<{ start: string; end: string }> }> = [];

      if (response.data.calendars) {
        for (const [calendarId, calendarData] of Object.entries(response.data.calendars)) {
          result.push({
            calendar: calendarId,
            busy: calendarData.busy?.map(period => ({
              start: period.start || '',
              end: period.end || '',
            })) || [],
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Failed to get free/busy info:', error);
      return [];
    }
  }

  /**
   * Search events by query
   */
  async searchEvents(
    userId: string,
    query: string,
    timeMin?: Date,
    timeMax?: Date
  ): Promise<CalendarEvent[]> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return [];
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.events.list({
        calendarId: 'primary',
        q: query,
        timeMin: timeMin?.toISOString(),
        timeMax: timeMax?.toISOString(),
        maxResults: this.MAX_RESULTS,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      return events
        .map(event => this.parseCalendarEvent(event))
        .filter((event): event is CalendarEvent => event !== null);
    } catch (error) {
      throw this.createError('Failed to search calendar events', error);
    }
  }

  /**
   * Get event count for a time range
   */
  async getEventCount(userId: string, timeMin: Date, timeMax: Date): Promise<number> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return 0;
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 1,
        singleEvents: true,
      });

      // Use resultSizeEstimate if available, otherwise count items
      return response.data.items?.length || 0;
    } catch (error) {
      console.error('Failed to get event count:', error);
      return 0;
    }
  }

  /**
   * Delay helper for rate limiting
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
export const googleCalendarService = new GoogleCalendarService();

// Export class for testing
export default GoogleCalendarService;
