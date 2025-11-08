const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

function createApiRoutes(onuService, apiService, rateLimiter) {

  // Get all ONUs with details
  router.get('/onus', async (req, res) => {
    try {
      const filters = {
        olt_id: req.query.olt_id,
        board: req.query.board,
        port: req.query.port,
        zone: req.query.zone,
        odb: req.query.odb
      };

      // Remove undefined values
      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const onus = await onuService.getAllOnusWithDetails(filters);

      res.json({
        status: true,
        count: onus.length,
        data: onus
      });
    } catch (error) {
      logger.error('Error in GET /api/onus:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get ONUs with GPS coordinates
  router.get('/onus/gps', async (req, res) => {
    try {
      const filters = {
        olt_id: req.query.olt_id,
        board: req.query.board,
        port: req.query.port,
        zone: req.query.zone
      };

      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const onus = await onuService.getOnusWithGps(filters);

      res.json({
        status: true,
        count: onus.length,
        data: onus
      });
    } catch (error) {
      logger.error('Error in GET /api/onus/gps:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get ONUs grouped by ODB
  router.get('/onus/by-odb', async (req, res) => {
    try {
      const filters = {
        olt_id: req.query.olt_id,
        board: req.query.board,
        port: req.query.port,
        zone: req.query.zone
      };

      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const odbGroups = await onuService.getOnusByOdb(filters);

      res.json({
        status: true,
        count: odbGroups.length,
        data: odbGroups
      });
    } catch (error) {
      logger.error('Error in GET /api/onus/by-odb:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get single ONU details
  router.get('/onus/:externalId', async (req, res) => {
    try {
      const onu = await onuService.getOnuById(req.params.externalId);

      res.json({
        status: true,
        data: onu
      });
    } catch (error) {
      logger.error(`Error in GET /api/onus/${req.params.externalId}:`, error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get status history
  router.get('/history', async (req, res) => {
    try {
      const history = onuService.getStatusHistory();

      res.json({
        status: true,
        data: history
      });
    } catch (error) {
      logger.error('Error in GET /api/history:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get OLTs list
  router.get('/olts', async (req, res) => {
    try {
      const result = await apiService.getOltsList();
      res.json(result);
    } catch (error) {
      logger.error('Error in GET /api/olts:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get ODBs list - NEW
  router.get('/odbs', async (req, res) => {
    try {
      const filters = {
        zone: req.query.zone
      };

      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const result = await apiService.getOdbsList(filters);
      res.json(result);
    } catch (error) {
      logger.error('Error in GET /api/odbs:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Refresh specific ONU statuses - NEW
  router.post('/onus/refresh-status', async (req, res) => {
    try {
      const { external_ids } = req.body;

      if (!external_ids || !Array.isArray(external_ids)) {
        return res.status(400).json({
          status: false,
          error: 'external_ids array is required'
        });
      }

      const results = await onuService.refreshOnuStatuses(external_ids);

      res.json({
        status: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      logger.error('Error in POST /api/onus/refresh-status:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get rate limiter stats
  router.get('/rate-limit-stats', async (req, res) => {
    try {
      const stats = {
        gps_remaining: rateLimiter.getRemainingCalls('gps'),
        details_remaining: rateLimiter.getRemainingCalls('details'),
        gps_limit: rateLimiter.gpsLimit,
        details_limit: rateLimiter.detailsLimit
      };

      res.json({
        status: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error in GET /api/rate-limit-stats:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Get statistics
  router.get('/statistics', async (req, res) => {
    try {
      const filters = {
        olt_id: req.query.olt_id,
        board: req.query.board,
        port: req.query.port,
        zone: req.query.zone
      };

      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const stats = await onuService.getStatistics(filters);

      res.json({
        status: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error in GET /api/statistics:', error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  // Debug endpoint untuk troubleshooting - NEW
  router.get('/debug/onu-status/:externalId', async (req, res) => {
    try {
      const externalId = req.params.externalId;

      // Get raw data from all endpoints
      const [detailsResponse, statusResponse, signalResponse] = await Promise.all([
        apiService.getOnuDetails(externalId).catch(e => ({ error: e.message })),
        apiService.getOnuStatus(externalId).catch(e => ({ error: e.message })),
        apiService.getOnuSignal(externalId).catch(e => ({ error: e.message }))
      ]);

      res.json({
        status: true,
        debug_data: {
          external_id: externalId,
          details_response: detailsResponse,
          status_response: statusResponse,
          signal_response: signalResponse,
          processed_status: statusResponse.onu_status ?
            onuService.determineOnuStatus(statusResponse.onu_status) :
            'No status available'
        }
      });
    } catch (error) {
      logger.error(`Error in GET /api/debug/onu-status/${req.params.externalId}:`, error);
      res.status(500).json({
        status: false,
        error: error.message
      });
    }
  });

  return router;
}

module.exports = createApiRoutes;