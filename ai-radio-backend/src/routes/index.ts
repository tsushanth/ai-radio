/**
 * Main Router
 * Combines all route modules
 */

import express from 'express';
import authRoutes from './auth';
import podcastRoutes from './podcast';
import userRoutes from './user';
import healthRoutes from './health';
import linkedAccountsRoutes from './linked-accounts';
import topicsRoutes from './topics';
import voicesRoutes from './voices';
import voiceCloneRoutes from './voice';
import deepdiveRoutes from './deepdive';
import livestationRoutes from './livestation';
import qaRoutes from './qa';
import customsourceRoutes from './customsource';
import interactionsRoutes from './interactions';
import contextRoutes from './context';
import notificationsRoutes from './notifications';
import batchRoutes from './batch';
import adsRoutes from './ads';
import configRoutes from './config';

const router = express.Router();

// Mount routes
router.use('/config', configRoutes);
router.use('/auth', authRoutes);
router.use('/podcast', podcastRoutes);
router.use('/user', userRoutes);
router.use('/health', healthRoutes);
router.use('/linked-accounts', linkedAccountsRoutes);
router.use('/topics', topicsRoutes);
router.use('/voices', voicesRoutes);
router.use('/voice', voiceCloneRoutes);
router.use('/deepdive', deepdiveRoutes);
router.use('/livestation', livestationRoutes);
router.use('/qa', qaRoutes);
router.use('/sources', customsourceRoutes);
router.use('/interactions', interactionsRoutes);
router.use('/context', contextRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/batch', batchRoutes);
router.use('/ads', adsRoutes);

// API root
router.get('/', (req, res) => {
  res.json({
    message: 'AI Radio API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      podcast: '/api/podcast',
      user: '/api/user',
      health: '/api/health',
      linked_accounts: '/api/linked-accounts',
      topics: '/api/topics',
      voices: '/api/voices',
      voice: '/api/voice',
      deepdive: '/api/deepdive',
      livestation: '/api/livestation',
      qa: '/api/qa',
      sources: '/api/sources',
      interactions: '/api/interactions',
      context: '/api/context',
      notifications: '/api/notifications',
      batch: '/api/batch',
      ads: '/api/ads',
    },
    documentation: 'https://github.com/your-repo/ai-radio',
  });
});

export default router;
