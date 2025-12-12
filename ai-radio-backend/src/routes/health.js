/**
 * Health Check Routes
 * Health and readiness endpoints for monitoring
 */

const express = require('express');
const router = express.Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ai-radio-backend',
  });
});

/**
 * GET /health/ready
 * Readiness check (checks dependencies)
 */
router.get('/ready', async (req, res) => {
  // TODO: Check database connection
  // TODO: Check external service availability
  // TODO: Add comprehensive health checks

  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'ok', // TODO: Implement actual check
      openai: 'ok', // TODO: Implement actual check
      storage: 'ok', // TODO: Implement actual check
    },
  });
});

/**
 * GET /health/live
 * Liveness check
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
