/**
 * OpenAI Configuration
 * OpenAI API settings and model configurations
 */

// TODO: Load from environment variables
// TODO: Add model selection configuration
// TODO: Add prompt templates
// TODO: Add token limits and pricing tiers

module.exports = {
  apiKey: process.env.OPENAI_API_KEY || '',
  organization: process.env.OPENAI_ORG_ID || '',
  models: {
    // TODO: Configure model preferences
    scriptGeneration: 'gpt-4-turbo-preview',
    summarization: 'gpt-3.5-turbo',
  },
  parameters: {
    // TODO: Configure default parameters
    temperature: 0.7,
    maxTokens: 2000,
  },
  // TODO: Add prompt templates for different use cases
  prompts: {
    // radioScript: '...',
    // emailSummary: '...',
    // calendarSummary: '...',
  },
};
