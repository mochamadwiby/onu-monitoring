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

  return router;
}

module.exports = createApiRoutes;