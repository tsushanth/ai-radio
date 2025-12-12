/**
 * Text-to-Speech Configuration
 * TTS provider settings and voice configurations
 */

// TODO: Load from environment variables
// TODO: Add voice selection configuration
// TODO: Add audio format settings
// TODO: Support multiple TTS providers

module.exports = {
  provider: process.env.TTS_PROVIDER || 'google', // 'google', 'elevenlabs', 'aws'

  google: {
    apiKey: process.env.GOOGLE_TTS_API_KEY || '',
    voice: {
      // TODO: Configure default voice settings
      languageCode: 'en-US',
      name: 'en-US-Neural2-J',
      ssmlGender: 'MALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0,
    },
  },

  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || '',
    // TODO: Add ElevenLabs specific configuration
  },

  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    // TODO: Add AWS Polly configuration
  },

  // TODO: Add audio processing settings
  // TODO: Add storage settings for generated audio
};
