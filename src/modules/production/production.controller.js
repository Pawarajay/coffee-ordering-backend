
'use strict';

const { productionService } = require('./production.service');
const Response              = require('../../utils/response');

const productionController = {

  async getRawMaterials(req, res, next) {
    try {
      const result = await productionService.getRawMaterialLevels(req.query);
      return Response.ok(
        res, result.raw_materials, 'Raw material stock levels fetched.', result.meta
      );
    } catch (err) { return next(err); }
  },


  async rawMaterialStockIn(req, res, next) {
    try {
      const result = await productionService.rawMaterialStockIn(req.body, req.user.id);
      return Response.ok(res, result, 'Raw material stock received successfully.');
    } catch (err) { return next(err); }
  },


  async createBatch(req, res, next) {
    try {
      const batch = await productionService.createBatch(req.body, req.user.id);
      return Response.created(res, batch, 'Production batch created successfully.');
    } catch (err) { return next(err); }
  },

 
  async listBatches(req, res, next) {
    try {
      const result = await productionService.listBatches(req.query);
      return Response.ok(res, result.batches, 'Production batches fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  
  async getBatchById(req, res, next) {
    try {
      const batch = await productionService.getBatchById(req.params.id);
      return Response.ok(res, batch);
    } catch (err) { return next(err); }
  },


  async distribute(req, res, next) {
    try {
      const result = await productionService.distribute(req.body, req.user.id);
      return Response.ok(res, result, 'Product distributed successfully.');
    } catch (err) { return next(err); }
  },

  
  async getDistributionLog(req, res, next) {
    try {
      const result = await productionService.getDistributionLog(req.query);
      return Response.ok(res, result.logs, 'Distribution log fetched.', result.meta);
    } catch (err) { return next(err); }
  },

 
  async getCentralInventory(req, res, next) {
    try {
      const summary = await productionService.getCentralInventorySummary();
      return Response.ok(res, summary, 'Central inventory fetched.');
    } catch (err) { return next(err); }
  },
};

module.exports = { productionController };


