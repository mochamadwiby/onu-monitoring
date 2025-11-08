const logger = require('./logger');

class RateLimiter {
  constructor(config) {
    this.apiDelay = config.apiDelay;
    this.gpsLimit = config.gpsLimit;
    this.detailsLimit = config.detailsLimit;
    this.lastCallTime = 0;
    this.callCounts = {
      gps: [],
      details: []
    };
  }

  async waitForNextCall() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    if (timeSinceLastCall < this.apiDelay) {
      const waitTime = this.apiDelay - timeSinceLastCall;
      logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.lastCallTime = Date.now();
  }

  canCallEndpoint(endpointType) {
    if (!['gps', 'details'].includes(endpointType)) {
      return { allowed: true };
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    this.callCounts[endpointType] = this.callCounts[endpointType].filter(
      timestamp => timestamp > oneHourAgo
    );

    const limit = endpointType === 'gps' ? this.gpsLimit : this.detailsLimit;
    const currentCount = this.callCounts[endpointType].length;

    if (currentCount >= limit) {
      const oldestCall = this.callCounts[endpointType][0];
      const resetTime = oldestCall + (60 * 60 * 1000);
      const waitMinutes = Math.ceil((resetTime - now) / (60 * 1000));

      logger.warn(`Rate limit reached for ${endpointType}. Wait ${waitMinutes} minutes.`);

      return {
        allowed: false,
        waitMinutes,
        resetTime: new Date(resetTime)
      };
    }

    return { allowed: true };
  }

  recordCall(endpointType) {
    if (['gps', 'details'].includes(endpointType)) {
      this.callCounts[endpointType].push(Date.now());
      logger.debug(`Recorded ${endpointType} call. Count: ${this.callCounts[endpointType].length}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getRemainingCalls(endpointType) {
    if (!['gps', 'details'].includes(endpointType)) {
      return null;
    }

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    this.callCounts[endpointType] = this.callCounts[endpointType].filter(
      timestamp => timestamp > oneHourAgo
    );

    const limit = endpointType === 'gps' ? this.gpsLimit : this.detailsLimit;
    return limit - this.callCounts[endpointType].length;
  }
}

module.exports = RateLimiter;