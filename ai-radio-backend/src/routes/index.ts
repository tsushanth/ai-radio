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
import deepdiveRoutes from './deepdive';

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/podcast', podcastRoutes);
router.use('/user', userRoutes);
router.use('/health', healthRoutes);
router.use('/linked-accounts', linkedAccountsRoutes);
router.use('/topics', topicsRoutes);
router.use('/voices', voicesRoutes);
router.use('/deepdive', deepdiveRoutes);

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
      deepdive: '/api/deepdive',
    },
    documentation: 'https://github.com/your-repo/ai-radio',
  });
});

export default router;
