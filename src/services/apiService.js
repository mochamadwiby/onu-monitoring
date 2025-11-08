const axios = require('axios');
const logger = require('../utils/logger');

class ApiService {
  constructor(config, rateLimiter) {
    this.baseUrl = config.apiBaseUrl;
    this.apiKey = config.apiKey;
    this.rateLimiter = rateLimiter;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'X-Token': this.apiKey,
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`API Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(`API Error Response: ${error.response.status} ${error.response.config.url}`, {
            data: error.response.data
          });
        } else if (error.request) {
          logger.error('API No Response:', error.request);
        } else {
          logger.error('API Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  async makeRequest(endpoint, params = {}, endpointType = 'normal') {
    try {
      // Check rate limit for restricted endpoints
      if (endpointType !== 'normal') {
        const limitCheck = this.rateLimiter.canCallEndpoint(endpointType);
        if (!limitCheck.allowed) {
          throw new Error(
            `Rate limit exceeded for ${endpointType}. Please wait ${limitCheck.waitMinutes} minutes.`
          );
        }
      }

      // Wait for rate limiter
      await this.rateLimiter.waitForNextCall();

      // Make request
      const response = await this.client.get(endpoint, { params });

      // Record call for restricted endpoints
      if (endpointType !== 'normal') {
        this.rateLimiter.recordCall(endpointType);
      }

      // Validate response
      if (!response.data) {
        throw new Error('Empty response from API');
      }

      if (response.data.status === false) {
        throw new Error(response.data.error || 'API returned error status');
      }

      return response.data;
    } catch (error) {
      logger.error(`API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  // Critical endpoints
  async getOltsList() {
    return this.makeRequest('/system/get_olts');
  }

  async getOnuStatuses(params = {}) {
    return this.makeRequest('/onu/get_onus_statuses', params);
  }

  async getAllOnusDetails(params = {}) {
    return this.makeRequest('/onu/get_all_onus_details', params, 'details');
  }

  async getAllOnusGpsCoordinates(params = {}) {
    return this.makeRequest('/onu/get_all_onus_gps_coordinates', params, 'gps');
  }

  async getOnuStatus(onuExternalId) {
    return this.makeRequest(`/onu/get_onu_status/${onuExternalId}`);
  }

  async getOnuDetails(onuExternalId) {
    return this.makeRequest(`/onu/get_onu_details/${onuExternalId}`);
  }

  async getOnuSignal(onuExternalId) {
    return this.makeRequest(`/onu/get_onu_signal/${onuExternalId}`);
  }

  // Supporting endpoints
  async getOltPonPortsDetails(oltId) {
    return this.makeRequest(`/system/get_olt_pon_ports_details/${oltId}`);
  }

  async getOnuAdministrativeStatus(onuExternalId) {
    return this.makeRequest(`/onu/get_onu_administrative_status/${onuExternalId}`);
  }

  async getOnusDetailsBySn(sn) {
    return this.makeRequest(`/onu/get_onus_details_by_sn/${sn}`);
  }
}

module.exports = ApiService;