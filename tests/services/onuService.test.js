const OnuService = require('../../src/services/onuService');

describe('OnuService', () => {
  let onuService;
  let mockApiService;
  let mockCacheService;
  let config;

  beforeEach(() => {
    config = {
      cache: {
        ttl: {
          onuDetails: 3600,
          onuStatus: 60,
          gps: 3600
        }
      }
    };

    mockApiService = {
      getAllOnusDetails: jest.fn(),
      getOnuStatuses: jest.fn(),
      getAllOnusGpsCoordinates: jest.fn(),
      getOnuDetails: jest.fn(),
      getOnuStatus: jest.fn(),
      getOnuSignal: jest.fn()
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    onuService = new OnuService(mockApiService, mockCacheService, config);
  });

  describe('determineOnuStatus', () => {
    test('should return Online for online status', () => {
      expect(onuService.determineOnuStatus('Online')).toBe('Online');
    });

    test('should return LOS for LOS status', () => {
      expect(onuService.determineOnuStatus('LOS')).toBe('LOS');
      expect(onuService.determineOnuStatus('los')).toBe('LOS');
    });

    test('should return Power Fail for power fail status', () => {
      expect(onuService.determineOnuStatus('Power fail')).toBe('Power Fail');
      expect(onuService.determineOnuStatus('power')).toBe('Power Fail');
    });

    test('should return Offline for offline status', () => {
      expect(onuService.determineOnuStatus('Offline')).toBe('Offline');
    });

    test('should handle null status', () => {
      expect(onuService.determineOnuStatus(null)).toBe('Offline');
    });
  });

  describe('getStatusColor', () => {
    test('should return correct colors for each status', () => {
      expect(onuService.getStatusColor('Online')).toBe('#28a745');
      expect(onuService.getStatusColor('LOS')).toBe('#dc3545');
      expect(onuService.getStatusColor('Power Fail')).toBe('#ffc107');
      expect(onuService.getStatusColor('Offline')).toBe('#6c757d');
    });
  });

  describe('getAllOnusWithDetails', () => {
    test('should return cached data when available', async () => {
      const cachedData = [{ id: '1', status: 'Online' }];
      mockCacheService.get.mockReturnValue(cachedData);

      const result = await onuService.getAllOnusWithDetails();

      expect(result).toEqual(cachedData);
      expect(mockApiService.getAllOnusDetails).not.toHaveBeenCalled();
    });

    test('should fetch fresh data when cache is empty', async () => {
      mockCacheService.get.mockReturnValue(null);

      const mockOnus = [
        {
          unique_external_id: 'onu1',
          name: 'Test ONU',
          board: '1',
          port: '1',
          onu: '1'
        }
      ];

      const mockStatuses = [
        {
          unique_external_id: 'onu1',
          onu_status: 'Online'
        }
      ];

      mockApiService.getAllOnusDetails.mockResolvedValue({
        status: true,
        response: mockOnus
      });

      mockApiService.getOnuStatuses.mockResolvedValue({
        status: true,
        response: mockStatuses
      });

      const result = await onuService.getAllOnusWithDetails();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('Online');
      expect(result[0].status_color).toBe('#28a745');
      expect(mockCacheService.set).toHaveBeenCalled();
    });

    test('should handle API errors gracefully', async () => {
      mockCacheService.get.mockReturnValue(null);
      mockApiService.getAllOnusDetails.mockRejectedValue(new Error('API Error'));

      await expect(onuService.getAllOnusWithDetails())
        .rejects.toThrow('API Error');
    });
  });

  describe('trackStatusChange', () => {
    test('should track LOS events', () => {
      const onu = {
        unique_external_id: 'test1',
        name: 'Test ONU',
        odb_name: 'ODB1',
        board: '1',
        port: '1',
        onu: '1'
      };

      onuService.trackStatusChange(onu, 'LOS', 'Online');

      expect(onuService.statusHistory.recentLos).toHaveLength(1);
      expect(onuService.statusHistory.recentLos[0].new_status).toBe('LOS');
    });

    test('should track Power Fail events', () => {
      const onu = {
        unique_external_id: 'test1',
        name: 'Test ONU',
        odb_name: 'ODB1',
        board: '1',
        port: '1',
        onu: '1'
      };

      onuService.trackStatusChange(onu, 'Power Fail', 'Online');

      expect(onuService.statusHistory.recentPowerFail).toHaveLength(1);
      expect(onuService.statusHistory.recentPowerFail[0].new_status).toBe('Power Fail');
    });

    test('should not track when status unchanged', () => {
      const onu = {
        unique_external_id: 'test1',
        name: 'Test ONU'
      };

      onuService.trackStatusChange(onu, 'Online', 'Online');

      expect(onuService.statusHistory.recentLos).toHaveLength(0);
      expect(onuService.statusHistory.recentPowerFail).toHaveLength(0);
    });

    test('should limit history to 50 events', () => {
      const onu = {
        unique_external_id: 'test1',
        name: 'Test ONU',
        odb_name: 'ODB1',
        board: '1',
        port: '1',
        onu: '1'
      };

      // Add 60 events
      for (let i = 0; i < 60; i++) {
        onuService.trackStatusChange(onu, 'LOS', 'Online');
      }

      expect(onuService.statusHistory.recentLos).toHaveLength(50);
    });
  });

  describe('getOnuById', () => {
    test('should return cached ONU details', async () => {
      const cachedOnu = { id: '1', status: 'Online' };
      mockCacheService.get.mockReturnValue(cachedOnu);

      const result = await onuService.getOnuById('test-id');

      expect(result).toEqual(cachedOnu);
      expect(mockApiService.getOnuDetails).not.toHaveBeenCalled();
    });

    test('should fetch and combine ONU data', async () => {
      mockCacheService.get.mockReturnValue(null);

      mockApiService.getOnuDetails.mockResolvedValue({
        status: true,
        onu_details: { id: '1', name: 'Test' }
      });

      mockApiService.getOnuStatus.mockResolvedValue({
        status: true,
        onu_status: 'Online'
      });

      mockApiService.getOnuSignal.mockResolvedValue({
        status: true,
        onu_signal: 'Good'
      });

      const result = await onuService.getOnuById('test-id');

      expect(result.status).toBe('Online');
      expect(result.signal).toBeDefined();
      expect(mockCacheService.set).toHaveBeenCalled();
    });
  });

  describe('determineOnuStatus - Extended', () => {
    test('should handle various online status formats', () => {
      expect(onuService.determineOnuStatus('online')).toBe('Online');
      expect(onuService.determineOnuStatus('Online')).toBe('Online');
      expect(onuService.determineOnuStatus('ONLINE')).toBe('Online');
      expect(onuService.determineOnuStatus('working')).toBe('Online');
      expect(onuService.determineOnuStatus('up')).toBe('Online');
    });

    test('should handle various LOS status formats', () => {
      expect(onuService.determineOnuStatus('los')).toBe('LOS');
      expect(onuService.determineOnuStatus('LOS')).toBe('LOS');
      expect(onuService.determineOnuStatus('loss of signal')).toBe('LOS');
    });

    test('should handle various power fail formats', () => {
      expect(onuService.determineOnuStatus('power fail')).toBe('Power Fail');
      expect(onuService.determineOnuStatus('powerfail')).toBe('Power Fail');
      expect(onuService.determineOnuStatus('dying-gasp')).toBe('Power Fail');
      expect(onuService.determineOnuStatus('dyinggasp')).toBe('Power Fail');
    });

    test('should use last_down_cause as fallback', () => {
      expect(onuService.determineOnuStatus(null, 'dying-gasp')).toBe('Power Fail');
      expect(onuService.determineOnuStatus('unknown', 'los detected')).toBe('LOS');
    });
  });
});