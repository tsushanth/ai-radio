/**
 * Routes Index
 * Central router configuration
 */

const express = require('express');
const router = express.Router();

// TODO: Import all route modules
const authRoutes = require('./auth');
const podcastRoutes = require('./podcast');
const userRoutes = require('./user');
const healthRoutes = require('./health');

// Mount routes
router.use('/auth', authRoutes);
router.use('/podcast', podcastRoutes);
router.use('/user', userRoutes);
router.use('/health', healthRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'AI Radio API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      auth: '/api/auth',
      podcast: '/api/podcast',
      user: '/api/user',
      health: '/api/health',
    },
  });
});

module.exports = router;
