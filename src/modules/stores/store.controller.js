
'use strict';

const { storeService } = require('./store.service');
const Response         = require('../../utils/response');

const storeController = {

  async create(req, res, next) {
    try {
      const store = await storeService.create(req.body);
      return Response.created(res, store, 'Store created successfully.');
    } catch (err) { return next(err); }
  },

  async getList(req, res, next) {
    try {
      const result = await storeService.getList(req.query);
      return Response.ok(res, result.stores, 'Stores fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const store = await storeService.getById(req.params.id, true);
      return Response.ok(res, store);
    } catch (err) { return next(err); }
  },
  async update(req, res, next) {
    try {
      const store = await storeService.update(req.params.id, req.body);
      return Response.ok(res, store, 'Store updated.');
    } catch (err) { return next(err); }
  },

  async updateHours(req, res, next) {
    try {
      const store = await storeService.updateHours(
        req.params.id, req.body.operating_hours
      );
      return Response.ok(res, store, 'Operating hours updated.');
    } catch (err) { return next(err); }
  },

  async updateConfig(req, res, next) {
    try {
      const store = await storeService.updateConfig(req.params.id, req.body.config);
      return Response.ok(res, store, 'Store config updated.');
    } catch (err) { return next(err); }
  },

  async assignStaff(req, res, next) {
    try {
      const result = await storeService.assignStaff(
        req.params.id, req.body.user_id, req.body.role
      );
      return Response.ok(res, result, 'Staff assigned to store.');
    } catch (err) { return next(err); }
  },

 
  async removeStaff(req, res, next) {
    try {
      const result = await storeService.removeStaff(
        req.params.id, parseInt(req.params.userId, 10)
      );
      return Response.ok(res, result, 'Staff removed from store.');
    } catch (err) { return next(err); }
  },

  async getStaff(req, res, next) {
    try {
      const staff = await storeService.getStaff(req.params.id);
      return Response.ok(res, staff, 'Store staff fetched.');
    } catch (err) { return next(err); }
  },

  async getDashboardSummary(req, res, next) {
    try {
      const storeId = parseInt(req.params.id, 10) || req.user.storeId;
      if (!storeId) return Response.badRequest(res, 'store_id is required.');
      const summary = await storeService.getDashboardSummary(storeId);
      return Response.ok(res, summary, 'Store dashboard summary fetched.');
    } catch (err) { return next(err); }
  },

  async getMenuOverrides(req, res, next) {
    try {
      const overrides = await storeService.getMenuOverrides(req.params.id);
      return Response.ok(res, overrides, 'Menu overrides fetched.');
    } catch (err) { return next(err); }
  },

  async setMenuOverride(req, res, next) {
    try {
      const overrides = await storeService.setMenuOverride(
        req.params.id, req.params.productId, req.body
      );
      return Response.ok(res, overrides, 'Menu override saved.');
    } catch (err) { return next(err); }
  },

  async deleteMenuOverride(req, res, next) {
    try {
      const result = await storeService.deleteMenuOverride(
        req.params.id, req.params.productId
      );
      return Response.ok(res, result, 'Menu override removed.');
    } catch (err) { return next(err); }
  },

  async deactivate(req, res, next) {
    try {
      const result = await storeService.deactivate(req.params.id);
      return Response.ok(res, result, 'Store deactivated.');
    } catch (err) { return next(err); }
  },
};

module.exports = { storeController };


