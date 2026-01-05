/**
 * Topic Preview Service
 * Fetches brief previews/headlines from user's followed topics
 * for inclusion in personalized daily briefings
 */

import { getTopicById, getActiveTopics } from '../../config/topics';
import { contentAggregator } from './aggregator.service';
import type { TopicDefinition, AggregatedStory, TopicCategory } from '../../types/topics';
import type { UserPreferences } from '../../types/database';

/**
 * A topic preview with top headlines
 */
export interface TopicPreview {
  topicId: string;
  topicName: string;
  category: TopicCategory;
  icon: string;
  color: string;
  headlines: string[]; // Top 2-3 headlines
  teaserText: string; // Short teaser for the podcast
}

/**
 * Collection of topic previews for a user
 */
export interface TopicPreviewCollection {
  previews: TopicPreview[];
  totalTopics: number;
  fetchedAt: Date;
}

export class TopicPreviewService {
  private readonly MAX_PREVIEWS = 3; // Max topics to preview in daily brief
  private readonly HEADLINES_PER_TOPIC = 2; // Headlines per topic

  /**
   * Get topic previews for a user's followed topics
   * These will be used to tease upcoming content in their daily brief
   */
  async getTopicPreviews(preferences: UserPreferences): Promise<TopicPreviewCollection> {
    const followedTopicIds = preferences.topics || [];

    // If user hasn't selected topics, use a default set
    const topicIds = followedTopicIds.length > 0
      ? followedTopicIds.slice(0, this.MAX_PREVIEWS)
      : this.getDefaultTopics();

    const previews: TopicPreview[] = [];

    // Fetch previews in parallel
    const previewPromises = topicIds.map(async (topicId) => {
      try {
        const preview = await this.fetchTopicPreview(topicId);
        if (preview) {
          return preview;
        }
      } catch (error) {
        console.warn(`Failed to fetch preview for topic ${topicId}:`, error);
      }
      return null;
    });

    const results = await Promise.all(previewPromises);

    for (const result of results) {
      if (result) {
        previews.push(result);
      }
    }

    return {
      previews,
      totalTopics: followedTopicIds.length || topicIds.length,
      fetchedAt: new Date(),
    };
  }

  /**
   * Fetch preview for a single topic
   */
  private async fetchTopicPreview(topicId: string): Promise<TopicPreview | null> {
    const topic = getTopicById(topicId);
    if (!topic) {
      console.warn(`Topic not found: ${topicId}`);
      return null;
    }

    try {
      // Fetch content from the topic's sources
      const content = await contentAggregator.aggregateTopicContent(topic);

      if (content.stories.length === 0) {
        return null;
      }

      // Get top headlines
      const topStories = content.stories.slice(0, this.HEADLINES_PER_TOPIC);
      const headlines = topStories.map(story => story.title);

      // Generate teaser text
      const teaserText = this.generateTeaserText(topic, topStories);

      return {
        topicId: topic.id,
        topicName: topic.name,
        category: topic.category,
        icon: topic.icon,
        color: topic.color,
        headlines,
        teaserText,
      };
    } catch (error) {
      console.error(`Error fetching preview for ${topicId}:`, error);
      return null;
    }
  }

  /**
   * Generate a conversational teaser for the topic
   */
  private generateTeaserText(topic: TopicDefinition, stories: AggregatedStory[]): string {
    if (stories.length === 0) {
      return `Check out ${topic.name} for the latest updates.`;
    }

    const firstStory = stories[0];

    // Generate category-specific teasers
    switch (topic.category) {
      case 'technology':
        return `In tech news: ${this.truncateTitle(firstStory.title)}. Tap ${topic.name} for more.`;
      case 'science':
        return `Science update: ${this.truncateTitle(firstStory.title)}. Explore ${topic.name} for details.`;
      case 'business':
        return `Business headlines: ${this.truncateTitle(firstStory.title)}. More in ${topic.name}.`;
      case 'news':
        return `Breaking: ${this.truncateTitle(firstStory.title)}. Get the full story in ${topic.name}.`;
      case 'sports':
        return `Sports: ${this.truncateTitle(firstStory.title)}. Full coverage in ${topic.name}.`;
      case 'entertainment':
        return `Entertainment buzz: ${this.truncateTitle(firstStory.title)}. More in ${topic.name}.`;
      case 'lifestyle':
        return `Trending: ${this.truncateTitle(firstStory.title)}. Discover more in ${topic.name}.`;
      default:
        return `${this.truncateTitle(firstStory.title)}. Explore ${topic.name} for more.`;
    }
  }

  /**
   * Truncate title to fit in teaser
   */
  private truncateTitle(title: string, maxLength: number = 60): string {
    if (title.length <= maxLength) {
      return title;
    }
    return title.substring(0, maxLength - 3).trim() + '...';
  }

  /**
   * Get default topics for users without preferences
   */
  private getDefaultTopics(): string[] {
    // Return a diverse mix of popular topics
    return ['daily-news', 'tech-news', 'ai-ml'];
  }

  /**
   * Format topic previews for script generation
   * Creates a prompt-friendly format for GPT-4
   */
  formatForScriptGeneration(previews: TopicPreviewCollection): string {
    if (previews.previews.length === 0) {
      return '';
    }

    let formatted = '\nTOPIC TEASERS (brief mentions of what\'s happening in the user\'s followed topics):\n';

    for (const preview of previews.previews) {
      formatted += `\n${preview.topicName}:\n`;
      formatted += `- Headlines: ${preview.headlines.join('; ')}\n`;
      formatted += `- Teaser: "${preview.teaserText}"\n`;
    }

    formatted += '\nInclude brief 1-2 sentence teasers for these topics near the end of the podcast, ';
    formatted += 'encouraging the listener to explore these topics for more details.\n';

    return formatted;
  }

  /**
   * Generate script segments for topic teasers
   * Can be added to the podcast script directly
   */
  generateTeaserSegments(previews: TopicPreviewCollection): Array<{
    speaker: 'host1' | 'host2';
    text: string;
    type: 'news';
  }> {
    const segments: Array<{
      speaker: 'host1' | 'host2';
      text: string;
      type: 'news';
    }> = [];

    if (previews.previews.length === 0) {
      return segments;
    }

    // Intro to teasers
    segments.push({
      speaker: 'host1',
      text: 'Before we wrap up, here\'s a quick peek at what\'s trending in your favorite topics.',
      type: 'news',
    });

    // Add teaser for each topic, alternating hosts
    previews.previews.forEach((preview, index) => {
      const speaker = index % 2 === 0 ? 'host2' : 'host1';
      segments.push({
        speaker: speaker as 'host1' | 'host2',
        text: preview.teaserText,
        type: 'news',
      });
    });

    // Closing for teasers
    if (previews.previews.length > 0) {
      segments.push({
        speaker: 'host2',
        text: 'Tap any topic to dive deeper and get the full story!',
        type: 'news',
      });
    }

    return segments;
  }
}

// Export singleton instance
export const topicPreviewService = new TopicPreviewService();

export default TopicPreviewService;
