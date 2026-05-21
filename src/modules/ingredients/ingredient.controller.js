

'use strict';

const {
  ingredientService,
  ingredientGroupService,
  ingredientMappingService,
} = require('./ingredient.service');
const Response = require('../../utils/response');


const ingredientController = {
  async create(req, res, next) {
    try {
      const ingredient = await ingredientService.create(req.body);
      return Response.created(res, ingredient, 'Ingredient created successfully.');
    } catch (err) { return next(err); }
  },

  async getList(req, res, next) {
    try {
      const result = await ingredientService.getList(req.query);
      return Response.ok(res, result.ingredients, 'Ingredients fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const ingredient = await ingredientService.getById(req.params.id);
      return Response.ok(res, ingredient);
    } catch (err) { return next(err); }
  },

  async update(req, res, next) {
    try {
      const ingredient = await ingredientService.update(req.params.id, req.body);
      return Response.ok(res, ingredient, 'Ingredient updated.');
    } catch (err) { return next(err); }
  },

  async delete(req, res, next) {
    try {
      await ingredientService.delete(req.params.id);
      return Response.ok(res, null, 'Ingredient deleted.');
    } catch (err) { return next(err); }
  },
};


const ingredientGroupController = {
  async create(req, res, next) {
    try {
      const group = await ingredientGroupService.create(req.body);
      return Response.created(res, group, 'Ingredient group created.');
    } catch (err) { return next(err); }
  },

  async getAll(req, res, next) {
    try {
      const groups = await ingredientGroupService.getAll();
      return Response.ok(res, groups);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const group = await ingredientGroupService.getById(req.params.id);
      return Response.ok(res, group);
    } catch (err) { return next(err); }
  },

  async update(req, res, next) {
    try {
      const group = await ingredientGroupService.update(req.params.id, req.body);
      return Response.ok(res, group, 'Ingredient group updated.');
    } catch (err) { return next(err); }
  },
  async delete(req, res, next) {
    try {
      await ingredientGroupService.delete(req.params.id);
      return Response.ok(res, null, 'Ingredient group deleted.');
    } catch (err) { return next(err); }
  },
};


const ingredientMappingController = {
  async getByProduct(req, res, next) {
    try {
      const result = await ingredientMappingService.getByProduct(req.params.productId);
      return Response.ok(res, result, 'Ingredient mappings fetched.');
    } catch (err) { return next(err); }
  },

  async addMapping(req, res, next) {
    try {
      const result = await ingredientMappingService.addMapping(req.params.productId, req.body);
      return Response.created(res, result, 'Ingredient mapped to product.');
    } catch (err) { return next(err); }
  },

  async updateMapping(req, res, next) {
    try {
      const result = await ingredientMappingService.updateMapping(
        req.params.productId,
        req.params.ingredientId,
        req.body
      );
      return Response.ok(res, result, 'Mapping updated.');
    } catch (err) { return next(err); }
  },

  async removeMapping(req, res, next) {
    try {
      await ingredientMappingService.removeMapping(
        req.params.productId,
        req.params.ingredientId
      );
      return Response.ok(res, null, 'Mapping removed.');
    } catch (err) { return next(err); }
  },

  async bulkSet(req, res, next) {
    try {
      const result = await ingredientMappingService.bulkSet(
        req.params.productId,
        req.body.ingredients
      );
      return Response.ok(res, result, 'Ingredient mappings replaced successfully.');
    } catch (err) { return next(err); }
  },

  async previewPrice(req, res, next) {
    try {
      const result = await ingredientMappingService.previewPrice(
        req.params.productId,
        req.body.ingredients
      );
      return Response.ok(res, result, 'Price calculated.');
    } catch (err) { return next(err); }
  },
};

module.exports = {
  ingredientController,
  ingredientGroupController,
  ingredientMappingController,
};