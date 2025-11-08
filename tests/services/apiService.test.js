const ApiService = require('../../src/services/apiService');
const RateLimiter = require('../../src/utils/rateLimiter');

describe('ApiService', () => {
  let apiService;
  let rateLimiter;
  let config;

  beforeEach(() => {
    config = {
      apiBaseUrl: 'https://test.smartolt.com/api',
      apiKey: 'test-key',
      rateLimit: {
        apiDelay: 100,
        gpsLimit: 3,
        detailsLimit: 3
      }
    };

    rateLimiter = new RateLimiter(config.rateLimit);
    apiService = new ApiService(config, rateLimiter);
  });

  describe('makeRequest', () => {
    test('should make successful API request', async () => {
      // Mock axios
      apiService.client.get = jest.fn().mockResolvedValue({
        data: {
          status: true,
          response: []
        }
      });

      const result = await apiService.makeRequest('/test');

      expect(result.status).toBe(true);
      expect(apiService.client.get).toHaveBeenCalledWith('/test', { params: {} });
    });

    test('should throw error on API error response', async () => {
      apiService.client.get = jest.fn().mockResolvedValue({
        data: {
          status: false,
          error: 'Test error'
        }
      });

      await expect(apiService.makeRequest('/test'))
        .rejects.toThrow('Test error');
    });

    test('should respect rate limits for GPS endpoint', async () => {
      apiService.client.get = jest.fn().mockResolvedValue({
        data: { status: true, response: [] }
      });

      // Make 3 successful calls
      for (let i = 0; i < 3; i++) {
        await apiService.makeRequest('/test', {}, 'gps');
      }

      // 4th call should fail
      await expect(apiService.makeRequest('/test', {}, 'gps'))
        .rejects.toThrow(/Rate limit exceeded/);
    });
  });

  describe('getOltsList', () => {
    test('should fetch OLTs list', async () => {
      const mockResponse = {
        status: true,
        response: [
          { id: '1', name: 'OLT1' }
        ]
      };

      apiService.client.get = jest.fn().mockResolvedValue({
        data: mockResponse
      });

      const result = await apiService.getOltsList();

      expect(result).toEqual(mockResponse);
      expect(apiService.client.get).toHaveBeenCalledWith('/system/get_olts', { params: {} });
    });
  });

  describe('getOnuStatus', () => {
    test('should fetch ONU status by external ID', async () => {
      const mockResponse = {
        status: true,
        onu_status: 'Online'
      };

      apiService.client.get = jest.fn().mockResolvedValue({
        data: mockResponse
      });

      const result = await apiService.getOnuStatus('test-id');

      expect(result.onu_status).toBe('Online');
    });
  });
});