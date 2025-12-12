/**
 * Main Router
 * Combines all route modules
 */

import express from 'express';
import authRoutes from './auth';
import podcastRoutes from './podcast';
import userRoutes from './user';
import healthRoutes from './health';

const router = express.Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/podcast', podcastRoutes);
router.use('/user', userRoutes);
router.use('/health', healthRoutes);

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
    },
    documentation: 'https://github.com/your-repo/ai-radio',
  });
});

export default router;
