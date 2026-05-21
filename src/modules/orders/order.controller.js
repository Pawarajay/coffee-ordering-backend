

'use strict';

const { orderService } = require('./order.service');
const Response = require('../../utils/response');

const orderController = {
  async create(req, res, next) {
    try {
      const customerId = req.user?.id || null;
      const order = await orderService.create(req.body, customerId);
      return Response.created(res, order, 'Order placed successfully.');
    } catch (err) { return next(err); }
  },

  async getList(req, res, next) {
    try {
      const result = await orderService.getList(req.query, req.user);
      return Response.ok(res, result.orders, 'Orders fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getMyOrders(req, res, next) {
    try {
      const result = await orderService.getOrderHistory(req.user.id, req.query);
      return Response.ok(res, result.orders, 'Order history fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const order = await orderService.getById(req.params.id);
      return Response.ok(res, order);
    } catch (err) { return next(err); }
  },

  async updateStatus(req, res, next) {
    try {
      const order = await orderService.updateStatus(
        req.params.id,
        req.body.status,
        req.user.id,
        req.body.notes
      );
      return Response.ok(res, order, `Order status updated to "${req.body.status}".`);
    } catch (err) { return next(err); }
  },

  async cancel(req, res, next) {
    try {
      const order = await orderService.cancelByCustomer(
        req.params.id,
        req.user.id,
        req.body.reason
      );
      return Response.ok(res, order, 'Order cancelled.');
    } catch (err) { return next(err); }
  },

 
  async discardAndReorder(req, res, next) {
    try {
      const result = await orderService.discardAndReorder(req.params.id, req.user.id);
      return Response.ok(res, result, result.message);
    } catch (err) { return next(err); }
  },


  async initiatePayment(req, res, next) {
    try {
      const result = await orderService.initiatePayment(req.params.id, req.body);
      return Response.ok(res, result, 'Payment initiated. Use gateway_order_id to complete checkout.');
    } catch (err) { return next(err); }
  },

 
  async recordPayment(req, res, next) {
    try {
      const order = await orderService.recordPayment(req.params.id, req.body, req.user.id);
      return Response.ok(res, order, 'Payment recorded successfully.');
    } catch (err) { return next(err); }
  },

  async getUnsyncedForAccounting(req, res, next) {
    try {
      const result = await orderService.getUnsyncedForAccounting(req.query);
      return Response.ok(res, result.orders, 'Unsynced orders fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async markAccountingSynced(req, res, next) {
    try {
      const result = await orderService.markAccountingSynced(req.body.order_ids);
      return Response.ok(res, result, `${result.synced_count} order(s) marked as synced.`);
    } catch (err) { return next(err); }
  },
};

module.exports = { orderController };