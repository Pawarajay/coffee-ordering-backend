

'use strict';

const { accountingService } = require('./accounting.service');
const Response              = require('../../utils/response');

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

module.exports = { accountingController };