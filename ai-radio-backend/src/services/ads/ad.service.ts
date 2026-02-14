/**
 * Ad Service
 * Handles ad selection, impression tracking, and campaign management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import type {
  AdSegment,
  AdImpressionPayload,
  AdClickPayload,
  CreateCampaignRequest,
  CreateCreativeRequest,
  CampaignStats,
} from '../../types/ads';

export class AdService {
  private supabase: SupabaseClient | null = null;
  private readonly AD_BUCKET = 'ad-assets';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
    }
  }

  /**
   * Initialize ad-assets storage bucket if it doesn't exist
   */
  private async initializeBucket(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const exists = buckets?.some(b => b.name === this.AD_BUCKET);

      if (!exists) {
        console.log(`[AdService] Creating bucket '${this.AD_BUCKET}'...`);
        await this.supabase.storage.createBucket(this.AD_BUCKET, {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'image/jpeg', 'image/png', 'image/webp'],
        });
        console.log(`[AdService] Bucket '${this.AD_BUCKET}' created`);
      }
    } catch (error) {
      console.error('[AdService] Failed to initialize bucket:', error);
    }
  }

  /**
   * Select ads for an episode based on topic and language
   * Returns up to maxAds ad segments for client-side insertion
   */
  async selectAdsForEpisode(
    topicId: string,
    language: string,
    maxAds: number = 2
  ): Promise<AdSegment[]> {
    if (!this.supabase) return [];

    try {
      const today = new Date().toISOString().split('T')[0];

      // Get active campaigns that match this topic
      const { data: campaigns, error: campError } = await this.supabase
        .from('ad_campaigns')
        .select('*')
        .eq('status', 'active')
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('priority', { ascending: false });

      if (campError || !campaigns || campaigns.length === 0) return [];

      // Filter campaigns by topic targeting
      const matchingCampaigns = campaigns.filter(c => {
        if (!c.target_topics || c.target_topics.length === 0) return true;
        return c.target_topics.includes(topicId);
      });

      if (matchingCampaigns.length === 0) return [];

      // Check impression caps for each campaign
      const eligibleCampaigns = [];
      for (const campaign of matchingCampaigns) {
        const isEligible = await this.checkImpressionCaps(campaign);
        if (isEligible) {
          eligibleCampaigns.push(campaign);
        }
        if (eligibleCampaigns.length >= maxAds) break;
      }

      if (eligibleCampaigns.length === 0) return [];

      // Get active creatives for eligible campaigns
      const campaignIds = eligibleCampaigns.map(c => c.id);
      const { data: creatives, error: crError } = await this.supabase
        .from('ad_creatives')
        .select('*')
        .in('campaign_id', campaignIds)
        .eq('is_active', true);

      if (crError || !creatives || creatives.length === 0) return [];

      // Select one creative per campaign, up to maxAds
      const selectedAds: AdSegment[] = [];
      const usedCampaigns = new Set<string>();

      for (const creative of creatives) {
        if (usedCampaigns.has(creative.campaign_id)) continue;
        if (selectedAds.length >= maxAds) break;

        selectedAds.push({
          type: 'ad',
          creativeId: creative.id,
          campaignId: creative.campaign_id,
          audioUrl: creative.audio_url,
          audioDurationSeconds: creative.audio_duration_seconds,
          companionImageUrl: creative.companion_image_url,
          clickThroughUrl: creative.click_through_url,
          ctaText: creative.cta_text,
        });

        usedCampaigns.add(creative.campaign_id);
      }

      return selectedAds;
    } catch (error) {
      console.error('[AdService] Error selecting ads:', error);
      return [];
    }
  }

  /**
   * Check if a campaign has remaining impression budget
   */
  private async checkImpressionCaps(campaign: {
    id: string;
    daily_impression_cap?: number;
    total_impression_cap?: number;
  }): Promise<boolean> {
    if (!this.supabase) return false;
    if (!campaign.daily_impression_cap && !campaign.total_impression_cap) return true;

    try {
      // Check daily cap
      if (campaign.daily_impression_cap) {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);

        const { count } = await this.supabase
          .from('ad_impressions')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .gte('impression_at', todayStart.toISOString());

        if ((count ?? 0) >= campaign.daily_impression_cap) return false;
      }

      // Check total cap
      if (campaign.total_impression_cap) {
        const { count } = await this.supabase
          .from('ad_impressions')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        if ((count ?? 0) >= campaign.total_impression_cap) return false;
      }

      return true;
    } catch {
      return true; // Allow on error (don't block ads due to counting issues)
    }
  }

  /**
   * Record an ad impression
   */
  async trackImpression(payload: AdImpressionPayload): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase.from('ad_impressions').insert({
        creative_id: payload.creativeId,
        campaign_id: payload.campaignId,
        episode_id: payload.episodeId,
        topic_id: payload.topicId,
        user_id: payload.userId,
        device_platform: payload.devicePlatform,
        language: payload.language,
        duration_listened_seconds: payload.durationListenedSeconds,
        was_skipped: payload.wasSkipped,
      });
    } catch (error) {
      console.error('[AdService] Failed to track impression:', error);
    }
  }

  /**
   * Record an ad click
   */
  async trackClick(payload: AdClickPayload): Promise<void> {
    if (!this.supabase) return;

    try {
      // Find the most recent impression for this creative/user and mark click
      const { data } = await this.supabase
        .from('ad_impressions')
        .select('id')
        .eq('creative_id', payload.creativeId)
        .eq('campaign_id', payload.campaignId)
        .order('impression_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        await this.supabase
          .from('ad_impressions')
          .update({
            click_occurred: true,
            click_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      }
    } catch (error) {
      console.error('[AdService] Failed to track click:', error);
    }
  }

  /**
   * Create a new ad campaign
   */
  async createCampaign(request: CreateCampaignRequest): Promise<{ id: string } | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('ad_campaigns')
      .insert({
        name: request.name,
        advertiser: request.advertiser,
        start_date: request.startDate,
        end_date: request.endDate,
        daily_impression_cap: request.dailyImpressionCap,
        total_impression_cap: request.totalImpressionCap,
        target_topics: request.targetTopics,
        priority: request.priority ?? 0,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AdService] Failed to create campaign:', error);
      throw new Error(`Failed to create campaign: ${error.message}`);
    }

    return data;
  }

  /**
   * Create a new ad creative
   */
  async createCreative(request: CreateCreativeRequest): Promise<{ id: string } | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('ad_creatives')
      .insert({
        campaign_id: request.campaignId,
        name: request.name,
        audio_url: request.audioUrl,
        audio_path: request.audioPath,
        audio_duration_seconds: request.audioDurationSeconds,
        companion_image_url: request.companionImageUrl,
        companion_image_path: request.companionImagePath,
        click_through_url: request.clickThroughUrl,
        cta_text: request.ctaText,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AdService] Failed to create creative:', error);
      throw new Error(`Failed to create creative: ${error.message}`);
    }

    return data;
  }

  /**
   * Get campaigns list
   */
  async getCampaigns(status?: string): Promise<unknown[]> {
    if (!this.supabase) return [];

    let query = this.supabase
      .from('ad_campaigns')
      .select('*, ad_creatives(id, name, audio_duration_seconds, is_active)')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  /**
   * Get campaign stats
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    if (!this.supabase) {
      return {
        campaignId,
        totalImpressions: 0,
        todayImpressions: 0,
        totalClicks: 0,
        clickThroughRate: 0,
        avgListenDuration: 0,
        skipRate: 0,
      };
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Total impressions
    const { count: totalImpressions } = await this.supabase
      .from('ad_impressions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    // Today's impressions
    const { count: todayImpressions } = await this.supabase
      .from('ad_impressions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .gte('impression_at', todayStart.toISOString());

    // Clicks
    const { count: totalClicks } = await this.supabase
      .from('ad_impressions')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('click_occurred', true);

    // Avg listen duration and skip rate
    const { data: impressionData } = await this.supabase
      .from('ad_impressions')
      .select('duration_listened_seconds, was_skipped')
      .eq('campaign_id', campaignId);

    const total = totalImpressions ?? 0;
    const clicks = totalClicks ?? 0;
    const avgListen = impressionData && impressionData.length > 0
      ? impressionData.reduce((sum, i) => sum + (i.duration_listened_seconds || 0), 0) / impressionData.length
      : 0;
    const skips = impressionData
      ? impressionData.filter(i => i.was_skipped).length
      : 0;

    return {
      campaignId,
      totalImpressions: total,
      todayImpressions: todayImpressions ?? 0,
      totalClicks: clicks,
      clickThroughRate: total > 0 ? (clicks / total) * 100 : 0,
      avgListenDuration: Math.round(avgListen),
      skipRate: total > 0 ? (skips / total) * 100 : 0,
    };
  }
}

// Export singleton
export const adService = new AdService();
