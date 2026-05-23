'use strict';

const { Router }            = require('express');
const { accountingService } = require('./accounting.service');
const Response              = require('../../utils/response');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { isAdmin }           = require('../../middlewares/role.middleware');

const router = Router();

const accountingController = {
  async syncOrder(req, res, next) {
    try {
      const force  = req.query.force === 'true';
      const result = await accountingService.syncOrder(req.params.orderId, force);
      return Response.ok(res, result, `Order synced to ${result.provider} successfully.`);
    } catch (err) { return next(err); }
  },
  async syncBulk(req, res, next) {
    try {
      const result = await accountingService.syncBulk(req.body);
      return Response.ok(
        res, result,
        `Bulk sync complete: ${result.synced} synced, ${result.failed} failed, ${result.skipped} skipped.`
      );
    } catch (err) { return next(err); }
  },
  async getSyncSummary(req, res, next) {
    try {
      const summary = await accountingService.getSyncSummary();
      return Response.ok(res, summary, 'Sync summary fetched.');
    } catch (err) { return next(err); }
  },
  async getSyncLogs(req, res, next) {
    try {
      const result = await accountingService.getSyncLogs(req.query);
      return Response.ok(res, result.logs, 'Sync logs fetched.', result.meta);
    } catch (err) { return next(err); }
  },
  async retrySync(req, res, next) {
    try {
      const result = await accountingService.retrySync(parseInt(req.params.logId, 10));
      return Response.ok(res, result, 'Retry successful.');
    } catch (err) { return next(err); }
  },
  async refreshToken(req, res, next) {
    try {
      const result = await accountingService.refreshZohoToken();
      return Response.ok(res, result, 'Zoho access token refreshed successfully.');
    } catch (err) { return next(err); }
  },
};

// Define routes
router.get('/', authenticate, isAdmin, async (req, res) => res.json({ data: [] })); // mock root endpoint for frontend
router.post('/sync/order/:orderId', authenticate, isAdmin, accountingController.syncOrder);
router.post('/sync/bulk', authenticate, isAdmin, accountingController.syncBulk);
router.get('/sync/summary', authenticate, isAdmin, accountingController.getSyncSummary);
router.get('/sync/logs', authenticate, isAdmin, accountingController.getSyncLogs);
router.post('/sync/logs/:logId/retry', authenticate, isAdmin, accountingController.retrySync);
router.post('/auth/zoho/refresh', authenticate, isAdmin, accountingController.refreshToken);

module.exports = router;