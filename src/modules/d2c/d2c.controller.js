
'use strict';

const { d2cService } = require('./d2c.service');
const Response       = require('../../utils/response');

function getCartIdentity(req) {
  return {
    customerId: req.user?.id   || null,
    sessionId:  req.headers['x-session-id'] || null,
  };
}

const d2cController = {

  async getCatalog(req, res, next) {
    try {
      const result = await d2cService.getCatalog(req.query);
      return Response.ok(res, result.products, 'Catalog fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getProductBySlug(req, res, next) {
    try {
      const product = await d2cService.getProductBySlug(req.params.slug);
      return Response.ok(res, product);
    } catch (err) { return next(err); }
  },


  async getOrCreateCart(req, res, next) {
    try {
      const { customerId, sessionId } = getCartIdentity(req);
      const sid  = sessionId || req.body?.session_id || null;
      const cart = await d2cService.getOrCreateCart(sid, customerId);
      return Response.ok(res, cart, 'Cart ready.');
    } catch (err) { return next(err); }
  },

  async getCart(req, res, next) {
    try {
      const { customerId, sessionId } = getCartIdentity(req);
      const cart = await d2cService.getCart(req.params.cartId, sessionId, customerId);
      return Response.ok(res, cart);
    } catch (err) { return next(err); }
  },

  async addItem(req, res, next) {
    try {
      const { customerId, sessionId } = getCartIdentity(req);
      const cart = await d2cService.addItem(
        req.params.cartId, req.body, sessionId, customerId
      );
      return Response.ok(res, cart, 'Item added to cart.');
    } catch (err) { return next(err); }
  },

  async updateItem(req, res, next) {
    try {
      const { customerId, sessionId } = getCartIdentity(req);
      const cart = await d2cService.updateItem(
        req.params.cartId,
        req.params.productId,  
        req.body.quantity,
        sessionId,
        customerId
      );
      return Response.ok(res, cart, 'Item updated.');
    } catch (err) { return next(err); }
  },

  async removeItem(req, res, next) {
    try {
      const cart = await d2cService.removeItem(
        req.params.cartId,
        req.params.productId   
      );
      return Response.ok(res, cart, 'Item removed from cart.');
    } catch (err) { return next(err); }
  },

  async clearCart(req, res, next) {
    try {
      const cart = await d2cService.clearCart(req.params.cartId);
      return Response.ok(res, cart, 'Cart cleared.');
    } catch (err) { return next(err); }
  },

  async mergeCarts(req, res, next) {
    try {
      const cart = await d2cService.mergeCarts(
        req.body.guest_session_id,
        req.user.id
      );
      return Response.ok(res, cart, 'Cart merged successfully.');
    } catch (err) { return next(err); }
  },


  async checkout(req, res, next) {
    try {
      const customerId = req.user?.id || null;
      const result     = await d2cService.checkout(
        req.params.cartId, req.body, customerId
      );
      return Response.created(res, result, 'Order placed successfully!');
    } catch (err) { return next(err); }
  },


  async getD2COrders(req, res, next) {
    try {
      const result = await d2cService.getD2COrders(req.user.id, req.query);
      return Response.ok(res, result.orders, 'D2C order history fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getD2COrderDetail(req, res, next) {
    try {
      const order = await d2cService.getD2COrderDetail(
        req.params.orderId, req.user.id
      );
      return Response.ok(res, order);
    } catch (err) { return next(err); }
  },


  async toggleD2CAvailability(req, res, next) {
    try {
      const result = await d2cService.toggleD2CAvailability(
        req.params.productId,
        req.body.is_available
      );
      return Response.ok(res, result, `Product D2C availability updated.`);
    } catch (err) { return next(err); }
  },


  async updateProductSlug(req, res, next) {
    try {
      const result = await d2cService.updateProductSlug(
        req.params.productId,
        req.body.slug
      );
      return Response.ok(res, result, 'Product slug updated.');
    } catch (err) { return next(err); }
  },

  
  async getD2CCategories(req, res, next) {
    try {
      const categories = await d2cService.getD2CCategories();
      return Response.ok(res, categories, 'D2C categories fetched.');
    } catch (err) { return next(err); }
  },
};

module.exports = { d2cController };