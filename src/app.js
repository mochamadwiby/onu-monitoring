const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const config = require('./config/api.config');
const logger = require('./utils/logger');
const RateLimiter = require('./utils/rateLimiter');
const CacheService = require('./services/cacheService');
const ApiService = require('./services/apiService');
const OnuService = require('./services/onuService');
const createApiRoutes = require('./routes/api.routes');

// Initialize services
const rateLimiter = new RateLimiter(config.rateLimit);
const cacheService = new CacheService(config.cache);
const apiService = new ApiService(config, rateLimiter);
const onuService = new OnuService(apiService, cacheService, config);

// Create Express app
const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow Leaflet to load
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', createApiRoutes(onuService, apiService, rateLimiter));

// Health check
app.get('/health', (req, res) => {
  const cacheStats = cacheService.getStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: cacheStats,
    rateLimits: {
      gps_remaining: rateLimiter.getRemainingCalls('gps'),
      details_remaining: rateLimiter.getRemainingCalls('details')
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    status: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: false,
    error: 'Not found'
  });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`API Base URL: ${config.apiBaseUrl}`);
});

module.exports = app;