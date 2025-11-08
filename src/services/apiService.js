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
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`API Request: ${config.method.toUpperCase()} ${config.url}`, {
          headers: {
            'X-Token': this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET'
          }
        });
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
          const status = error.response.status;
          const url = error.response.config.url;

          logger.error(`API Error Response: ${status} ${url}`, {
            data: error.response.data,
            headers: error.response.headers
          });

          // Handle specific error codes
          if (status === 403) {
            logger.error('403 Forbidden - Check API Key and permissions', {
              apiKey: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET',
              url: url
            });
          } else if (status === 401) {
            logger.error('401 Unauthorized - Invalid API Key', {
              apiKey: this.apiKey ? `${this.apiKey.substring(0, 10)}...` : 'NOT SET'
            });
          } else if (status === 429) {
            logger.error('429 Too Many Requests - Rate limit exceeded');
          }
        } else if (error.request) {
          logger.error('API No Response:', {
            url: error.config?.url,
            message: 'No response received from server'
          });
        } else {
          logger.error('API Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  async makeRequest(endpoint, params = {}, endpointType = 'normal') {
    try {
      // Validate API key
      if (!this.apiKey || this.apiKey === 'your_api_key_here') {
        throw new Error('Invalid API Key. Please configure API_KEY in .env file');
      }

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
        const errorMsg = response.data.error || 'API returned error status';

        // Check for common error messages
        if (errorMsg.toLowerCase().includes('invalid api key')) {
          throw new Error('Invalid API Key. Please check your API_KEY configuration in .env file');
        }

        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error) {
      // Enhanced error message
      if (error.response?.status === 403) {
        const enhancedError = new Error(
          `403 Forbidden: Access denied. Please verify:\n` +
          `1. API Key is correct in .env file\n` +
          `2. API Key has proper permissions\n` +
          `3. Endpoint URL is correct: ${this.baseUrl}${endpoint}\n` +
          `4. Your IP is allowed (if IP whitelisting is enabled)`
        );
        logger.error('Enhanced 403 error:', enhancedError.message);
        throw enhancedError;
      }

      if (error.response?.status === 401) {
        throw new Error(
          `401 Unauthorized: Invalid API Key. Current key starts with: ${this.apiKey?.substring(0, 10)}...`
        );
      }

      logger.error(`API request failed for ${endpoint}:`, error.message);
      throw error;
    }
  }

  // Test API connection
  async testConnection() {
    try {
      logger.info('Testing API connection...');
      const result = await this.getOltsList();
      logger.info('API connection successful');
      return { success: true, message: 'Connected successfully' };
    } catch (error) {
      logger.error('API connection test failed:', error.message);
      return { success: false, message: error.message };
    }
  }

  // Critical endpoints
  async getOdbs(params = {}) {
    return this.makeRequest('/system/get_odbs', params);
  }

  async getOdbById(odbId) {
    return this.makeRequest(`/system/get_odb/${odbId}`);
  }

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