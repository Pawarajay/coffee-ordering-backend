
'use strict';

const { inventoryService } = require('./inventory.service');
const Response             = require('../../utils/response');

const inventoryController = {


  async getStockLevels(req, res, next) {
    try {
      const result = await inventoryService.getStockLevels(req.query);
      return Response.ok(res, result.stock, 'Stock levels fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async stockIn(req, res, next) {
    try {
      const result = await inventoryService.stockIn(req.body, req.user.id);
      return Response.ok(res, result, 'Stock recorded successfully.');
    } catch (err) { return next(err); }
  },

  
  async adjust(req, res, next) {
    try {
      const result = await inventoryService.adjust(req.body, req.user.id);
      return Response.ok(res, result, 'Stock adjusted successfully.');
    } catch (err) { return next(err); }
  },

 
  async recordWastage(req, res, next) {
    try {
      const result = await inventoryService.recordWastage(req.body, req.user.id);
      return Response.ok(res, result, 'Wastage recorded.');
    } catch (err) { return next(err); }
  },

 
  async getTransactions(req, res, next) {
    try {
      const result = await inventoryService.getTransactions(req.query);
      return Response.ok(res, result.transactions, 'Transactions fetched.', result.meta);
    } catch (err) { return next(err); }
  },


  async getAlertSummary(req, res, next) {
    try {
      const storeId = req.user.storeId || req.query.store_id;
      if (!storeId) return Response.badRequest(res, 'store_id is required.');
      const summary = await inventoryService.getAlertSummary(storeId);
      return Response.ok(res, summary, 'Alert summary fetched.');
    } catch (err) { return next(err); }
  },

  async getAlerts(req, res, next) {
    try {
      const result = await inventoryService.getAlerts(req.query);
      return Response.ok(res, result.alerts, 'Alerts fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async resolveAlert(req, res, next) {
    try {
      const result = await inventoryService.resolveAlert(
        parseInt(req.params.id, 10), req.user.id
      );
      return Response.ok(res, result, 'Alert resolved.');
    } catch (err) { return next(err); }
  },


  async centralRawMaterialIn(req, res, next) {
    try {
      const result = await inventoryService.centralRawMaterialIn(req.body, req.user.id);
      return Response.ok(res, result, 'Raw material recorded at central facility.');
    } catch (err) { return next(err); }
  },

  
  async createProductionBatch(req, res, next) {
    try {
      const batch = await inventoryService.createProductionBatch(req.body, req.user.id);
      return Response.created(res, batch, 'Production batch created successfully.');
    } catch (err) { return next(err); }
  },


  async getProductionBatches(req, res, next) {
    try {
      const result = await inventoryService.getProductionBatches(req.query);
      return Response.ok(res, result.batches, 'Production batches fetched.', result.meta);
    } catch (err) { return next(err); }
  },

 
  async distributeToChannel(req, res, next) {
    try {
      const result = await inventoryService.distributeToChannel(req.body, req.user.id);
      return Response.created(res, result, 'Distribution recorded successfully.');
    } catch (err) { return next(err); }
  },


  async getDistributionOrders(req, res, next) {
    try {
      const result = await inventoryService.getDistributionOrders(req.query);
      return Response.ok(
        res, result.distributions, 'Distribution orders fetched.', result.meta
      );
    } catch (err) { return next(err); }
  },
};

module.exports = { inventoryController };