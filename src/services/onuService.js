const logger = require('../utils/logger');

class OnuService {
  constructor(apiService, cacheService, config) {
    this.api = apiService;
    this.cache = cacheService;
    this.config = config;
    this.statusHistory = {
      recentLos: [],
      recentPowerFail: []
    };
  }

  /**
   * Determine ONU operational status based on API response
   */
  determineOnuStatus(statusString, lastDownCause = null) {
    if (!statusString) return 'Offline';

    const status = statusString.toLowerCase();

    if (status === 'online') {
      return 'Online';
    } else if (status === 'los' || status.includes('los')) {
      return 'LOS';
    } else if (status === 'power fail' || status.includes('power')) {
      return 'Power Fail';
    } else if (status === 'offline') {
      return 'Offline';
    }

    // Fallback based on last down cause
    if (lastDownCause) {
      const cause = lastDownCause.toLowerCase();
      if (cause.includes('los') || cause.includes('signal')) {
        return 'LOS';
      } else if (cause.includes('power') || cause.includes('dying-gasp')) {
        return 'Power Fail';
      }
    }

    return 'Offline';
  }

  /**
   * Get color based on ONU status
   */
  getStatusColor(status) {
    const colors = {
      'Online': '#28a745',      // Green
      'LOS': '#dc3545',         // Red
      'Power Fail': '#ffc107',  // Yellow
      'Offline': '#6c757d'      // Gray
    };
    return colors[status] || '#6c757d';
  }

  /**
   * Track status changes for history
   */
  trackStatusChange(onu, newStatus, oldStatus) {
    if (newStatus === oldStatus) return;

    const timestamp = new Date().toISOString();
    const event = {
      unique_external_id: onu.unique_external_id,
      name: onu.name || 'Unknown',
      odb_name: onu.odb_name || 'Unknown',
      board: onu.board,
      port: onu.port,
      onu: onu.onu,
      old_status: oldStatus,
      new_status: newStatus,
      timestamp
    };

    // Track LOS events
    if (newStatus === 'LOS') {
      this.statusHistory.recentLos.unshift(event);
      if (this.statusHistory.recentLos.length > 50) {
        this.statusHistory.recentLos.pop();
      }
    }

    // Track Power Fail events
    if (newStatus === 'Power Fail') {
      this.statusHistory.recentPowerFail.unshift(event);
      if (this.statusHistory.recentPowerFail.length > 50) {
        this.statusHistory.recentPowerFail.pop();
      }
    }

    logger.info(`Status change tracked: ${onu.unique_external_id} ${oldStatus} -> ${newStatus}`);
  }

  /**
   * Get all ONUs with their complete information
   */
  async getAllOnusWithDetails(filters = {}) {
    try {
      const cacheKey = `all_onus_${JSON.stringify(filters)}`;
      const cached = this.cache.get(cacheKey);

      if (cached) {
        logger.info('Returning cached ONU data');
        return cached;
      }

      logger.info('Fetching fresh ONU data from API');

      // Get all ONUs details
      const detailsResponse = await this.api.getAllOnusDetails(filters);

      if (!detailsResponse.status || !detailsResponse.response) {
        throw new Error('Invalid response from get_all_onus_details');
      }

      const onus = detailsResponse.response;
      logger.info(`Retrieved ${onus.length} ONUs`);

      // Get statuses for all ONUs
      const statusResponse = await this.api.getOnuStatuses(filters);
      const statusMap = {};

      if (statusResponse.status && statusResponse.response) {
        statusResponse.response.forEach(item => {
          statusMap[item.unique_external_id] = item.onu_status;
        });
      }

      // Process each ONU
      const processedOnus = onus.map(onu => {
        const rawStatus = statusMap[onu.unique_external_id];
        const status = this.determineOnuStatus(rawStatus);
        const color = this.getStatusColor(status);

        // Check cache for old status
        const oldStatusKey = `status_${onu.unique_external_id}`;
        const oldStatus = this.cache.get(oldStatusKey);

        if (oldStatus && oldStatus !== status) {
          this.trackStatusChange(onu, status, oldStatus);
        }

        // Cache current status
        this.cache.set(oldStatusKey, status, this.config.cache.ttl.onuStatus);

        return {
          ...onu,
          status,
          status_color: color,
          raw_status: rawStatus
        };
      });

      // Cache the result
      this.cache.set(cacheKey, processedOnus, this.config.cache.ttl.onuDetails);

      return processedOnus;
    } catch (error) {
      logger.error('Error in getAllOnusWithDetails:', error);
      throw error;
    }
  }

  /**
   * Get ONUs with GPS coordinates
   */
  async getOnusWithGps(filters = {}) {
    try {
      const cacheKey = `onus_gps_${JSON.stringify(filters)}`;
      const cached = this.cache.get(cacheKey);

      if (cached) {
        logger.info('Returning cached GPS data');
        return cached;
      }

      logger.info('Fetching fresh GPS data from API');

      // Get GPS coordinates
      const gpsResponse = await this.api.getAllOnusGpsCoordinates(filters);

      if (!gpsResponse.status || !gpsResponse.onus) {
        throw new Error('Invalid response from get_all_onus_gps_coordinates');
      }

      const gpsOnus = gpsResponse.onus;
      logger.info(`Retrieved GPS data for ${gpsOnus.length} ONUs`);

      // Get details for these ONUs
      const detailsResponse = await this.api.getAllOnusDetails(filters);
      const detailsMap = {};

      if (detailsResponse.status && detailsResponse.response) {
        detailsResponse.response.forEach(onu => {
          detailsMap[onu.unique_external_id] = onu;
        });
      }

      // Get statuses
      const statusResponse = await this.api.getOnuStatuses(filters);
      const statusMap = {};

      if (statusResponse.status && statusResponse.response) {
        statusResponse.response.forEach(item => {
          statusMap[item.unique_external_id] = item.onu_status;
        });
      }

      // Combine data
      const result = gpsOnus.map(gpsOnu => {
        const details = detailsMap[gpsOnu.unique_external_id] || {};
        const rawStatus = statusMap[gpsOnu.unique_external_id];
        const status = this.determineOnuStatus(rawStatus);
        const color = this.getStatusColor(status);

        return {
          unique_external_id: gpsOnu.unique_external_id,
          latitude: parseFloat(gpsOnu.latitude),
          longitude: parseFloat(gpsOnu.longitude),
          status,
          status_color: color,
          raw_status: rawStatus,
          ...details
        };
      });

      // Cache the result
      this.cache.set(cacheKey, result, this.config.cache.ttl.gps);

      return result;
    } catch (error) {
      logger.error('Error in getOnusWithGps:', error);
      throw error;
    }
  }

  /**
   * Get ONU details by external ID
   */
  async getOnuById(externalId) {
    try {
      const cacheKey = `onu_detail_${externalId}`;
      const cached = this.cache.get(cacheKey);

      if (cached) {
        return cached;
      }

      const [detailsResponse, statusResponse, signalResponse] = await Promise.all([
        this.api.getOnuDetails(externalId),
        this.api.getOnuStatus(externalId),
        this.api.getOnuSignal(externalId)
      ]);

      if (!detailsResponse.status) {
        throw new Error('Failed to get ONU details');
      }

      const rawStatus = statusResponse.status ? statusResponse.onu_status : null;
      const status = this.determineOnuStatus(rawStatus);
      const color = this.getStatusColor(status);

      const result = {
        ...detailsResponse.onu_details,
        status,
        status_color: color,
        raw_status: rawStatus,
        signal: signalResponse.status ? signalResponse : null
      };

      this.cache.set(cacheKey, result, this.config.cache.ttl.onuStatus);

      return result;
    } catch (error) {
      logger.error(`Error getting ONU ${externalId}:`, error);
      throw error;
    }
  }

  /**
   * Get status history
   */
  getStatusHistory() {
    return {
      recent_los: this.statusHistory.recentLos.slice(0, 20),
      recent_power_fail: this.statusHistory.recentPowerFail.slice(0, 20)
    };
  }

  /**
   * Get ODB-grouped ONUs for antline visualization
   */
  async getOnusByOdb(filters = {}) {
    try {
      const onus = await this.getOnusWithGps(filters);

      // Group by ODB
      const odbGroups = {};

      onus.forEach(onu => {
        const odbName = onu.odb_name || 'Unknown';

        if (!odbGroups[odbName]) {
          odbGroups[odbName] = {
            odb_name: odbName,
            onus: [],
            odb_coordinates: null // Should be fetched or set manually
          };
        }

        odbGroups[odbName].onus.push(onu);
      });

      return Object.values(odbGroups);
    } catch (error) {
      logger.error('Error in getOnusByOdb:', error);
      throw error;
    }
  }
}

module.exports = OnuService;