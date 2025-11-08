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
    this.odbCache = new Map(); // Cache for ODB data
  }

  /**
   * Determine ONU operational status based on API response
   */
  determineOnuStatus(statusString) {
    if (!statusString) return 'Offline';

    const status = statusString.toLowerCase().trim();

    if (status === 'online') {
      return 'Online';
    } else if (status === 'los' || status.includes('los')) {
      return 'LOS';
    } else if (status === 'power fail' || status.includes('power')) {
      return 'Power Fail';
    } else if (status === 'offline') {
      return 'Offline';
    }

    // Default to offline for unknown status
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

      // Get all ONUs details (already includes status in response)
      const detailsResponse = await this.api.getAllOnusDetails(filters);

      if (!detailsResponse.status || !detailsResponse.onus) {
        throw new Error('Invalid response from get_all_onus_details');
      }

      const onus = detailsResponse.onus;
      logger.info(`Retrieved ${onus.length} ONUs`);

      // Process each ONU
      const processedOnus = onus.map(onu => {
        // Status is already in the response
        const rawStatus = onu.status;
        const status = this.determineOnuStatus(rawStatus);
        const color = this.getStatusColor(status);

        // Check cache for old status to track changes
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
          raw_status: rawStatus,
          // Ensure latitude and longitude are numbers
          latitude: onu.latitude ? parseFloat(onu.latitude) : null,
          longitude: onu.longitude ? parseFloat(onu.longitude) : null
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

      logger.info('Fetching fresh data from API (using get_all_onus_details)');

      // Use get_all_onus_details instead of GPS endpoint to avoid rate limiting
      // This endpoint includes coordinates, status, and all other info
      const detailsResponse = await this.api.getAllOnusDetails(filters);

      if (!detailsResponse.status || !detailsResponse.onus) {
        throw new Error('Invalid response from get_all_onus_details');
      }

      const onus = detailsResponse.onus;
      logger.info(`Retrieved ${onus.length} ONUs`);

      // Filter only ONUs with valid coordinates and process them
      const onusWithGps = onus
        .filter(onu => {
          const lat = onu.latitude ? parseFloat(onu.latitude) : null;
          const lng = onu.longitude ? parseFloat(onu.longitude) : null;
          return lat && lng && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
        })
        .map(onu => {
          const rawStatus = onu.status;
          const status = this.determineOnuStatus(rawStatus);
          const color = this.getStatusColor(status);

          // Track status changes
          const oldStatusKey = `status_${onu.unique_external_id}`;
          const oldStatus = this.cache.get(oldStatusKey);

          if (oldStatus && oldStatus !== status) {
            this.trackStatusChange(onu, status, oldStatus);
          }

          this.cache.set(oldStatusKey, status, this.config.cache.ttl.onuStatus);

          return {
            ...onu,
            status,
            status_color: color,
            raw_status: rawStatus,
            latitude: parseFloat(onu.latitude),
            longitude: parseFloat(onu.longitude)
          };
        });

      logger.info(`Filtered to ${onusWithGps.length} ONUs with valid GPS coordinates`);

      // Cache the result
      this.cache.set(cacheKey, onusWithGps, this.config.cache.ttl.gps);

      return onusWithGps;
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

      const [detailsResponse, signalResponse] = await Promise.all([
        this.api.getOnuDetails(externalId),
        this.api.getOnuSignal(externalId).catch(() => ({ status: false }))
      ]);

      if (!detailsResponse.status) {
        throw new Error('Failed to get ONU details');
      }

      const onu = detailsResponse.onu_details;
      const rawStatus = onu.status;
      const status = this.determineOnuStatus(rawStatus);
      const color = this.getStatusColor(status);

      const result = {
        ...onu,
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
        const odbName = onu.odb_name || 'Unknown ODB';

        if (!odbGroups[odbName]) {
          odbGroups[odbName] = {
            odb_name: odbName,
            onus: []
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

  /**
   * Get statistics summary
   */
  async getStatistics(filters = {}) {
    try {
      const onus = await this.getAllOnusWithDetails(filters);

      const stats = {
        total: onus.length,
        online: 0,
        los: 0,
        power_fail: 0,
        offline: 0,
        with_gps: 0,
        without_gps: 0,
        by_olt: {},
        by_zone: {},
        by_odb: {}
      };

      onus.forEach(onu => {
        // Count by status
        switch (onu.status) {
          case 'Online':
            stats.online++;
            break;
          case 'LOS':
            stats.los++;
            break;
          case 'Power Fail':
            stats.power_fail++;
            break;
          case 'Offline':
            stats.offline++;
            break;
        }

        // Count GPS
        if (onu.latitude && onu.longitude) {
          stats.with_gps++;
        } else {
          stats.without_gps++;
        }

        // Group by OLT
        const oltName = onu.olt_name || 'Unknown';
        if (!stats.by_olt[oltName]) {
          stats.by_olt[oltName] = { total: 0, online: 0, offline: 0 };
        }
        stats.by_olt[oltName].total++;
        if (onu.status === 'Online') {
          stats.by_olt[oltName].online++;
        } else {
          stats.by_olt[oltName].offline++;
        }

        // Group by Zone
        const zoneName = onu.zone_name || 'Unknown';
        if (!stats.by_zone[zoneName]) {
          stats.by_zone[zoneName] = { total: 0, online: 0, offline: 0 };
        }
        stats.by_zone[zoneName].total++;
        if (onu.status === 'Online') {
          stats.by_zone[zoneName].online++;
        } else {
          stats.by_zone[zoneName].offline++;
        }

        // Group by ODB
        const odbName = onu.odb_name || 'Unknown';
        if (!stats.by_odb[odbName]) {
          stats.by_odb[odbName] = { total: 0, online: 0, offline: 0 };
        }
        stats.by_odb[odbName].total++;
        if (onu.status === 'Online') {
          stats.by_odb[odbName].online++;
        } else {
          stats.by_odb[odbName].offline++;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error in getStatistics:', error);
      throw error;
    }
  }
}

module.exports = OnuService;