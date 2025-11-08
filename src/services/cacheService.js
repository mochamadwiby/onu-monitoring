const NodeCache = require('node-cache');
const logger = require('../utils/logger');

class CacheService {
  constructor(config) {
    this.cache = new NodeCache({
      stdTTL: config.ttl.onuStatus,
      checkperiod: 120
    });
    this.config = config;
  }

  get(key) {
    try {
      const value = this.cache.get(key);
      if (value) {
        logger.debug(`Cache hit for key: ${key}`);
        return value;
      }
      logger.debug(`Cache miss for key: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  set(key, value, ttl = null) {
    try {
      const actualTtl = ttl || this.config.ttl.onuStatus;
      this.cache.set(key, value, actualTtl);
      logger.debug(`Cache set for key: ${key}, TTL: ${actualTtl}s`);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  del(key) {
    try {
      this.cache.del(key);
      logger.debug(`Cache deleted for key: ${key}`);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  flush() {
    try {
      this.cache.flushAll();
      logger.info('Cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  getStats() {
    return this.cache.getStats();
  }
}

module.exports = CacheService;