

'use strict';

const { baristaService } = require('./barista.service');
const Response           = require('../../utils/response');

const baristaController = {

  async getQueue(req, res, next) {
    try {
      const storeId = req.user.storeId || req.query.store_id;
      if (!storeId) return Response.badRequest(res, 'store_id is required.');

      const queue = await baristaService.getQueue(storeId, {
        include_done_minutes: parseInt(req.query.include_done_minutes, 10) || 0,
      });
      return Response.ok(res, queue, 'Queue fetched.');
    } catch (err) { return next(err); }
  },

  async acceptKOT(req, res, next) {
    try {
      const kot = await baristaService.acceptKOT(
        req.params.id, req.user.id, req.user.storeId
      );
      return Response.ok(res, kot, 'KOT accepted — preparation started.');
    } catch (err) { return next(err); }
  },

  async completeKOT(req, res, next) {
    try {
      const kot = await baristaService.completeKOT(
        req.params.id, req.user.id, req.user.storeId
      );
      return Response.ok(res, kot, 'KOT completed — order is ready for pickup.');
    } catch (err) { return next(err); }
  },

  async completeOrder(req, res, next) {
    try {
      const order = await baristaService.completeOrder(
        req.params.id, req.user.id, req.user.storeId
      );
      return Response.ok(res, order, 'Order completed.');
    } catch (err) { return next(err); }
  },

  async cancelOrder(req, res, next) {
    try {
      const order = await baristaService.cancelOrder(
        req.params.id,
        req.user.id,
        req.user.storeId,
        req.body.reason
      );
      return Response.ok(res, order, 'Order cancelled.');
    } catch (err) { return next(err); }
  },
};

module.exports = { baristaController };