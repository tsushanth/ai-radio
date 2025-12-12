/**
 * AI Radio Backend - Main Entry Point
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// TODO: Import configuration
const appConfig = require('./config/app');

// TODO: Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// TODO: Import routes
const routes = require('./routes');

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors(appConfig.cors));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// TODO: Add request logging middleware
// TODO: Add request ID middleware

// Mount API routes
app.use('/api', routes);

// Health check (outside rate limiting)
app.get('/', (req, res) => {
  res.json({
    name: 'AI Radio Backend',
    version: '1.0.0',
    status: 'running',
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = appConfig.port;
const HOST = appConfig.host;

app.listen(PORT, HOST, () => {
  console.log(`🚀 AI Radio Backend running on ${HOST}:${PORT}`);
  console.log(`📡 Environment: ${appConfig.env}`);
  console.log(`📋 API available at: http://${HOST}:${PORT}/api`);
});

// TODO: Add graceful shutdown handling
// TODO: Add database connection initialization
// TODO: Add service health checks on startup

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // TODO: Add proper error logging
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // TODO: Add proper error logging
});

module.exports = app;
