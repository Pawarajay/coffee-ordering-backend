

'use strict';

const { kotService } = require('./kot.service');
const Response       = require('../../utils/response');

const kotController = {

  async getList(req, res, next) {
    try {
      const result = await kotService.getList(req.query, req.user);
      return Response.ok(res, result.kots, 'KOTs fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getPendingCount(req, res, next) {
    try {
      const storeId = req.user.storeId || req.query.store_id;
      if (!storeId)
        return Response.badRequest(res, 'store_id is required for admin users.');
      const counts = await kotService.getPendingCount(storeId);
      return Response.ok(res, counts, 'KOT counts fetched.');
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const kot = await kotService.getById(req.params.id);
      return Response.ok(res, kot);
    } catch (err) { return next(err); }
  },

  async getHistory(req, res, next) {
    try {
      const result = await kotService.getHistory(req.params.id);
      return Response.ok(res, result, 'KOT history fetched.');
    } catch (err) { return next(err); }
  },

  async markPrinted(req, res, next) {
    try {
      const kot = await kotService.markPrinted(req.params.id);
      return Response.ok(res, kot, 'KOT marked as printed.');
    } catch (err) { return next(err); }
  },

  async reprint(req, res, next) {
    try {
      const kot = await kotService.reprint(req.params.id, req.user.id);
      return Response.ok(res, kot, 'KOT re-printed successfully.');
    } catch (err) { return next(err); }
  },

  async updateStatus(req, res, next) {
    try {
      const kot = await kotService.updateStatus(
        req.params.id,
        req.body.status,
        req.user.id
      );
      return Response.ok(res, kot, `KOT status updated to "${req.body.status}".`);
    } catch (err) { return next(err); }
  },
};

module.exports = { kotController };