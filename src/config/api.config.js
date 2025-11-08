require('dotenv').config();

module.exports = {
  apiBaseUrl: process.env.API_BASE_URL,
  apiKey: process.env.API_KEY,
  apiSubdomain: process.env.API_SUBDOMAIN,
  port: process.env.PORT || 3000,
  cache: {
    ttl: {
      onuDetails: parseInt(process.env.CACHE_TTL_ONU_DETAILS) || 3600,
      onuStatus: parseInt(process.env.CACHE_TTL_ONU_STATUS) || 60,
      gps: parseInt(process.env.CACHE_TTL_GPS) || 3600
    }
  },
  rateLimit: {
    apiDelay: parseInt(process.env.API_DELAY) || 8000,
    gpsLimit: parseInt(process.env.GPS_API_LIMIT_PER_HOUR) || 3,
    detailsLimit: parseInt(process.env.DETAILS_API_LIMIT_PER_HOUR) || 3
  }
};