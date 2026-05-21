'use strict';

const { personalizationService } = require('./personalization.service');
const { reorderService }         = require('./reorder.service');
const Response                   = require('../../utils/response');

const personalizationController = {

 
  async getProfile(req, res, next) {
    try {
      const profile = await personalizationService.getProfile(req.user.id);
      return Response.ok(res, profile, 'Profile fetched.');
    } catch (err) { return next(err); }
  },


  async getOrderHistory(req, res, next) {
    try {
      const result = await personalizationService.getOrderHistory(
        req.user.id, req.query
      );
      return Response.ok(res, result.orders, 'Order history fetched.', result.meta);
    } catch (err) { return next(err); }
  },


  async getTopOrders(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 5;
      const items = await personalizationService.getTopOrders(req.user.id, limit);
      return Response.ok(res, items, 'Top orders fetched.');
    } catch (err) { return next(err); }
  },


  async getRecentDrinks(req, res, next) {
    try {
      const limit = parseInt(req.query.limit, 10) || 5;
      const items = await personalizationService.getRecentDrinks(req.user.id, limit);
      return Response.ok(res, items, 'Recent drinks fetched.');
    } catch (err) { return next(err); }
  },


  async getFavouriteDrinks(req, res, next) {
    try {
      const drinks = await personalizationService.getFavouriteDrinks(req.user.id);
      return Response.ok(res, drinks, 'Favourite drinks fetched.');
    } catch (err) { return next(err); }
  },


  async getTasteProfile(req, res, next) {
    try {
      const profile = await personalizationService.getTasteProfile(req.user.id);
      return Response.ok(res, profile, 'Taste profile fetched.');
    } catch (err) { return next(err); }
  },


  async reorderFromOrder(req, res, next) {
    try {
      const result = await reorderService.reorderFromPastOrder(
        req.params.orderId,
        req.user.id,
        req.body.store_id,
        req.body.channel || 'qr_mobile'
      );
      const msg = result.skipped.length
        ? `Order placed. ${result.skipped.length} item(s) skipped — no longer available.`
        : 'Order placed successfully.';
      return Response.created(res, result, msg);
    } catch (err) { return next(err); }
  },


  async reorderFromDrink(req, res, next) {
    try {
      const result = await reorderService.reorderFromCustomDrink(
        req.params.drinkId,
        req.user.id,
        req.body.store_id,
        req.body.channel || 'qr_mobile'
      );
      return Response.created(res, result, 'Your custom drink has been ordered!');
    } catch (err) { return next(err); }
  },
};

module.exports = { personalizationController };