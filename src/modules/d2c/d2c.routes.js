
'use strict';

const { Router }              = require('express');
const { d2cController }       = require('./d2c.controller');
const { d2cValidator }        = require('./d2c.validator');
const { validate }            = require('../../middlewares/validate.middleware');
const { authenticate,
        optionalAuthenticate } = require('../../middlewares/auth.middleware');
const { isAdmin }             = require('../../middlewares/role.middleware');

const router = Router();


router.get(
  '/catalog',
  validate(d2cValidator.catalogQuery, 'query'),
  d2cController.getCatalog
);

router.get(
  '/catalog/:slug',
  validate(d2cValidator.productSlugParam, 'params'),
  d2cController.getProductBySlug
);

router.get(
  '/cms/categories',
  authenticate,
  isAdmin,
  d2cController.getD2CCategories
);

router.patch(
  '/cms/products/:productId/availability',
  authenticate,
  isAdmin,
  validate(d2cValidator.toggleAvailability, 'params'),
  d2cController.toggleD2CAvailability
);

router.patch(
  '/cms/products/:productId/slug',
  authenticate,
  isAdmin,
  validate(d2cValidator.updateSlug, 'params'),
  d2cController.updateProductSlug
);

router.post(
  '/cart',
  optionalAuthenticate,
  d2cController.getOrCreateCart
);

router.get(
  '/cart/:cartId',
  optionalAuthenticate,
  validate(d2cValidator.cartIdParam, 'params'),
  d2cController.getCart
);

router.post(
  '/cart/:cartId/items',
  optionalAuthenticate,
  validate(d2cValidator.cartIdParam, 'params'),
  validate(d2cValidator.addItem),
  d2cController.addItem
);

router.patch(
  '/cart/:cartId/items/:productId',
  optionalAuthenticate,
  validate(d2cValidator.cartItemParam, 'params'),
  validate(d2cValidator.updateItem),
  d2cController.updateItem
);

router.delete(
  '/cart/:cartId/items/:productId',
  optionalAuthenticate,
  validate(d2cValidator.cartItemParam, 'params'),
  d2cController.removeItem
);

router.delete(
  '/cart/:cartId',
  optionalAuthenticate,
  validate(d2cValidator.cartIdParam, 'params'),
  d2cController.clearCart
);

/* ── Logged-in only ──────────────────────────────────────────────────────── */
router.post(
  '/cart/:cartId/merge',
  authenticate,
  validate(d2cValidator.cartIdParam, 'params'),
  validate(d2cValidator.mergeCart),
  d2cController.mergeCarts
);

/* Checkout — optionalAuthenticate (guests can checkout with shipping details) */
router.post(
  '/checkout/:cartId',
  optionalAuthenticate,
  validate(d2cValidator.cartIdParam, 'params'),
  validate(d2cValidator.checkout),
  d2cController.checkout
);

router.get(
  '/orders',
  authenticate,
  validate(d2cValidator.ordersQuery, 'query'),
  d2cController.getD2COrders
);

router.get(
  '/orders/:orderId',
  authenticate,
  validate(d2cValidator.orderIdParam, 'params'),
  d2cController.getD2COrderDetail
);

module.exports = router;