/**
 * AI Radio Backend - Main Entry Point
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/environment';

// Import middleware
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Import routes
import routes from './routes';

// Initialize Express app
const app = express();

// Trust proxy (required for Cloud Run behind load balancer)
app.set('trust proxy', true);

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
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export default app;
