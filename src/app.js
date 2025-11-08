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

// Test API connection endpoint
app.get('/api/test-connection', async (req, res) => {
  try {
    const result = await apiService.testConnection();

    if (result.success) {
      res.json({
        status: true,
        message: result.message,
        config: {
          baseUrl: config.apiBaseUrl,
          apiKeySet: !!config.apiKey && config.apiKey !== 'your_api_key_here',
          apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'NOT SET'
        }
      });
    } else {
      res.status(500).json({
        status: false,
        error: result.message,
        config: {
          baseUrl: config.apiBaseUrl,
          apiKeySet: !!config.apiKey && config.apiKey !== 'your_api_key_here',
          apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'NOT SET'
        }
      });
    }
  } catch (error) {
    logger.error('Connection test error:', error);
    res.status(500).json({
      status: false,
      error: error.message,
      config: {
        baseUrl: config.apiBaseUrl,
        apiKeySet: !!config.apiKey && config.apiKey !== 'your_api_key_here'
      }
    });
  }
});

// Debug endpoint to check configuration
app.get('/api/debug/config', (req, res) => {
  res.json({
    status: true,
    config: {
      nodeEnv: process.env.NODE_ENV,
      apiBaseUrl: config.apiBaseUrl,
      apiSubdomain: config.apiSubdomain,
      apiKeyConfigured: !!config.apiKey && config.apiKey !== 'your_api_key_here',
      apiKeyLength: config.apiKey ? config.apiKey.length : 0,
      apiKeyPrefix: config.apiKey ? config.apiKey.substring(0, 10) + '...' : 'NOT SET',
      port: config.port,
      rateLimit: config.rateLimit,
      cache: config.cache
    }
  });
});

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
    },
    config: {
      apiConfigured: !!config.apiKey && config.apiKey !== 'your_api_key_here'
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

// Test API connection on startup
(async () => {
  try {
    logger.info('Starting server...');
    logger.info(`API Base URL: ${config.apiBaseUrl}`);
    logger.info(`API Key configured: ${!!config.apiKey && config.apiKey !== 'your_api_key_here'}`);

    if (config.apiKey && config.apiKey !== 'your_api_key_here') {
      logger.info('Testing API connection...');
      const testResult = await apiService.testConnection();

      if (testResult.success) {
        logger.info('✓ API connection successful');
      } else {
        logger.warn('✗ API connection failed:', testResult.message);
        logger.warn('Application will start but API calls may fail');
      }
    } else {
      logger.warn('⚠ API Key not configured in .env file');
      logger.warn('Please set API_KEY in .env file');
    }
  } catch (error) {
    logger.error('Error during startup:', error.message);
  }
})();

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
  logger.info(`View application at: http://localhost:${PORT}`);
  logger.info(`Test connection at: http://localhost:${PORT}/api/test-connection`);
  logger.info(`Debug config at: http://localhost:${PORT}/api/debug/config`);
});

module.exports = app;