/**
 * Ad System Types
 * Types for native audio advertising with companion images
 */

export interface AdCampaign {
  id: string;
  name: string;
  advertiser: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  startDate: string;
  endDate?: string;
  dailyImpressionCap?: number;
  totalImpressionCap?: number;
  targetTopics?: string[];
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdCreative {
  id: string;
  campaignId: string;
  name: string;
  audioUrl: string;
  audioPath?: string;
  audioDurationSeconds: number;
  companionImageUrl?: string;
  companionImagePath?: string;
  clickThroughUrl?: string;
  ctaText?: string;
  isActive: boolean;
  createdAt: string;
}

/**
 * Ad segment returned to mobile clients
 * Inserted at natural break points in the podcast
 */
export interface AdSegment {
  type: 'ad';
  creativeId: string;
  campaignId: string;
  audioUrl: string;
  audioDurationSeconds: number;
  companionImageUrl?: string;
  clickThroughUrl?: string;
  ctaText?: string;
}

/**
 * Impression tracking payload from mobile clients
 */
export interface AdImpressionPayload {
  creativeId: string;
  campaignId: string;
  episodeId: string;
  topicId: string;
  userId?: string;
  devicePlatform: 'ios' | 'android' | 'web';
  language: string;
  durationListenedSeconds: number;
  wasSkipped: boolean;
}

/**
 * Click tracking payload from mobile clients
 */
export interface AdClickPayload {
  creativeId: string;
  campaignId: string;
  userId?: string;
}

/**
 * Segment timing info for client-side ad insertion
 */
export interface SegmentTiming {
  type: string;
  speaker: string;
  startTime: number;
  endTime: number;
}

/**
 * Campaign creation request
 */
export interface CreateCampaignRequest {
  name: string;
  advertiser: string;
  startDate: string;
  endDate?: string;
  dailyImpressionCap?: number;
  totalImpressionCap?: number;
  targetTopics?: string[];
  priority?: number;
}

/**
 * Creative creation request
 */
export interface CreateCreativeRequest {
  campaignId: string;
  name: string;
  audioUrl: string;
  audioPath?: string;
  audioDurationSeconds: number;
  companionImageUrl?: string;
  companionImagePath?: string;
  clickThroughUrl?: string;
  ctaText?: string;
}

/**
 * Campaign reporting stats
 */
export interface CampaignStats {
  campaignId: string;
  totalImpressions: number;
  todayImpressions: number;
  totalClicks: number;
  clickThroughRate: number;
  avgListenDuration: number;
  skipRate: number;
}
