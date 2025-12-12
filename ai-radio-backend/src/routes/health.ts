/**
 * Health Check Routes
 * System health and status endpoints
 */

import express, { Request, Response } from 'express';
import { storageService } from '../services/storage/storage.service';
import { openaiTTS } from '../services/tts/openai.tts';
import { scriptGenerator } from '../services/ai/script.generator';

const router = express.Router();

/**
 * GET /health
 * Basic health check
 */
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * GET /health/detailed
 * Detailed health check with service status
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {
      api: {
        status: 'healthy',
        uptime: process.uptime(),
      },
      storage: {
        status: 'unknown',
        configured: false,
      },
      openai: {
        status: 'unknown',
        model: '',
      },
      database: {
        status: 'unknown',
        connected: false,
      },
    },
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      node_version: process.version,
      platform: process.platform,
      memory: {
        used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    },
  };

  // Check storage service
  try {
    const storageConfig = storageService.getConfig();
    checks.services.storage = {
      status: storageConfig.configured ? 'healthy' : 'not_configured',
      configured: storageConfig.configured,
    };
  } catch (error) {
    checks.services.storage = {
      status: 'error',
      configured: false,
    };
  }

  // Check OpenAI service
  try {
    const modelInfo = scriptGenerator.getModelInfo();
    checks.services.openai = {
      status: process.env.OPENAI_API_KEY ? 'configured' : 'not_configured',
      model: modelInfo.model,
    };
  } catch (error) {
    checks.services.openai = {
      status: 'error',
      model: '',
    };
  }

  // Check database
  try {
    // TODO: Add actual database check
    // const { data, error } = await supabase.from('users').select('count').limit(1);
    checks.services.database = {
      status: process.env.SUPABASE_URL ? 'configured' : 'not_configured',
      connected: false,
    };
  } catch (error) {
    checks.services.database = {
      status: 'error',
      connected: false,
    };
  }

  // Determine overall status
  const serviceStatuses = Object.values(checks.services).map(s => s.status);
  if (serviceStatuses.some(s => s === 'error')) {
    checks.status = 'degraded';
  } else if (serviceStatuses.every(s => s === 'healthy' || s === 'configured')) {
    checks.status = 'healthy';
  } else {
    checks.status = 'partial';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

/**
 * GET /health/ready
 * Readiness check (K8s/Cloud Run)
 */
router.get('/ready', async (req: Request, res: Response) => {
  // Check if all required services are ready
  const isReady =
    process.env.OPENAI_API_KEY !== undefined &&
    (process.env.GOOGLE_CLIENT_ID !== undefined ||
     process.env.MICROSOFT_CLIENT_ID !== undefined);

  if (isReady) {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      message: 'Required services not configured',
    });
  }
});

/**
 * GET /health/live
 * Liveness check (K8s/Cloud Run)
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple check that process is alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/version
 * Get version information
 */
router.get('/version', (req: Request, res: Response) => {
  res.json({
    version: process.env.npm_package_version || '1.0.0',
    build: process.env.BUILD_ID || 'local',
    commit: process.env.COMMIT_SHA || 'unknown',
    node_version: process.version,
    environment: process.env.NODE_ENV || 'development',
  });
});

/**
 * GET /health/metrics
 * Get system metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  res.json({
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
    memory: {
      heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
      external_mb: Math.round(memoryUsage.external / 1024 / 1024),
    },
    cpu: {
      user_microseconds: cpuUsage.user,
      system_microseconds: cpuUsage.system,
    },
    process: {
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
    },
  });
});

export default router;
