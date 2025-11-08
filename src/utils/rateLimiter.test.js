const RateLimiter = require('../../src/utils/rateLimiter');

describe('RateLimiter', () => {
  let rateLimiter;
  let config;

  beforeEach(() => {
    config = {
      apiDelay: 100,
      gpsLimit: 3,
      detailsLimit: 3
    };
    rateLimiter = new RateLimiter(config);
  });

  describe('waitForNextCall', () => {
    test('should wait for configured delay', async () => {
      const start = Date.now();
      await rateLimiter.waitForNextCall();
      await rateLimiter.waitForNextCall();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(config.apiDelay);
    });
  });

  describe('canCallEndpoint', () => {
    test('should allow normal endpoints without limit', () => {
      const result = rateLimiter.canCallEndpoint('normal');
      expect(result.allowed).toBe(true);
    });

    test('should allow GPS calls within limit', () => {
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordCall('gps');
      }

      const result = rateLimiter.canCallEndpoint('gps');
      expect(result.allowed).toBe(false);
      expect(result.waitMinutes).toBeDefined();
    });

    test('should allow details calls within limit', () => {
      for (let i = 0; i < 2; i++) {
        rateLimiter.recordCall('details');
      }

      let result = rateLimiter.canCallEndpoint('details');
      expect(result.allowed).toBe(true);

      rateLimiter.recordCall('details');
      result = rateLimiter.canCallEndpoint('details');
      expect(result.allowed).toBe(false);
    });

    test('should reset limits after 1 hour', async () => {
      // Record max calls
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordCall('gps');
      }

      // Should be blocked
      let result = rateLimiter.canCallEndpoint('gps');
      expect(result.allowed).toBe(false);

      // Manually set old timestamps (simulate 1 hour passing)
      rateLimiter.callCounts.gps = [Date.now() - (61 * 60 * 1000)];

      // Should be allowed now
      result = rateLimiter.canCallEndpoint('gps');
      expect(result.allowed).toBe(true);
    });
  });

  describe('getRemainingCalls', () => {
    test('should return remaining calls correctly', () => {
      expect(rateLimiter.getRemainingCalls('gps')).toBe(3);

      rateLimiter.recordCall('gps');
      expect(rateLimiter.getRemainingCalls('gps')).toBe(2);

      rateLimiter.recordCall('gps');
      expect(rateLimiter.getRemainingCalls('gps')).toBe(1);

      rateLimiter.recordCall('gps');
      expect(rateLimiter.getRemainingCalls('gps')).toBe(0);
    });

    test('should return null for normal endpoints', () => {
      expect(rateLimiter.getRemainingCalls('normal')).toBeNull();
    });
  });

  describe('recordCall', () => {
    test('should record calls for limited endpoints', () => {
      rateLimiter.recordCall('gps');
      expect(rateLimiter.callCounts.gps).toHaveLength(1);

      rateLimiter.recordCall('details');
      expect(rateLimiter.callCounts.details).toHaveLength(1);
    });

    test('should not record calls for normal endpoints', () => {
      rateLimiter.recordCall('normal');
      expect(rateLimiter.callCounts.normal).toBeUndefined();
    });
  });
});