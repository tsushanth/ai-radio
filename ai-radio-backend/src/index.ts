/**
 * AI Radio Backend - Main Entry Point
 * Updated: 2025-01-21 - Service key refresh
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/environment';
import { flushLlmUsage } from './lib/llm';
import { dailyBriefScheduler } from './services/scheduler/daily-brief.scheduler';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Import routes
import routes from './routes';

// Initialize Express app
const app = express();

// Trust proxy (required for Cloud Run behind load balancer)
// Use 1 to trust only the first proxy hop (Cloud Run's load balancer)
// This fixes the express-rate-limit security warning about permissive trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// Mount API routes
app.use('/api', routes);

// Health check (outside rate limiting)
app.get('/', (req, res) => {
  res.json({
    name: 'AI Radio Backend',
    version: '1.0.0',
    status: 'running',
    environment: env.NODE_ENV,
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = env.PORT;
const HOST = env.HOST;

app.listen(PORT, HOST, () => {
  console.log(`🚀 AI Radio Backend running on ${HOST}:${PORT}`);
  console.log(`📡 Environment: ${env.NODE_ENV}`);
  console.log(`📋 API available at: http://${HOST}:${PORT}/api`);

  // Start the daily brief scheduler
  if (env.ENABLE_SCHEDULER) {
    dailyBriefScheduler.start();
    console.log(`⏰ Daily brief scheduler started`);
  }
});

// On SIGTERM/SIGINT send pending Claude usage rows (capped at 2.5 s), then re-raise the signal with the default handler so the
// process ends exactly as it did before this handler existed.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void flushLlmUsage(2500).finally(() => process.kill(process.pid, signal));
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
