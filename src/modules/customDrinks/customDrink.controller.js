
'use strict';

const { customDrinkService } = require('./customDrink.service');
const Response               = require('../../utils/response');

const customDrinkController = {

  async create(req, res, next) {
    try {
      const drink = await customDrinkService.createCustomDrink(req.user.id, req.body);
      return Response.created(res, drink, 'Custom drink saved successfully.');
    } catch (err) { return next(err); }
  },

  async list(req, res, next) {
    try {
      const result = await customDrinkService.listCustomDrinks(req.user.id, req.query);
      return Response.ok(res, result.data, 'Custom drinks fetched.', result.pagination);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const drink = await customDrinkService.getCustomDrinkByUUID(req.user.id, req.params.id);
      return Response.ok(res, drink);
    } catch (err) { return next(err); }
  },

  async update(req, res, next) {
    try {
      const drink = await customDrinkService.updateCustomDrink(
        req.user.id, req.params.id, req.body
      );
      return Response.ok(res, drink, 'Custom drink updated successfully.');
    } catch (err) { return next(err); }
  },

  async remove(req, res, next) {
    try {
      const result = await customDrinkService.deleteCustomDrink(req.user.id, req.params.id);
      return Response.ok(res, null, result.message);
    } catch (err) { return next(err); }
  },

  async reorder(req, res, next) {
    try {
      const order = await customDrinkService.reorderCustomDrink(
        req.user.id, req.params.id, req.body
      );
      return Response.created(res, order, 'Order placed successfully.');
    } catch (err) { return next(err); }
  },

 
  async share(req, res, next) {
    try {
      const result = await customDrinkService.shareViaWhatsApp(
        req.user.id, req.params.id, req.body.store_id
      );
      return Response.ok(res, null, result.message);
    } catch (err) { return next(err); }
  },
};

module.exports = { customDrinkController };