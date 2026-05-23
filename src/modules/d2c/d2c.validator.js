
'use strict';

const Joi = require('joi');

const uuidRegex     = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const indianMobile  = Joi.string().pattern(/^[6-9]\d{9}$/)
  .messages({ 'string.pattern.base': 'Please enter a valid 10-digit Indian mobile number.' });
const indianPincode = Joi.string().pattern(/^\d{6}$/)
  .messages({ 'string.pattern.base': 'Pincode must be 6 digits.' });

const d2cValidator = {

  /* GET /d2c/catalog */
  catalogQuery: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(50).default(20),
    category_id: Joi.number().integer().positive().optional(),
    search:      Joi.string().trim().max(100).optional(),
    sort_by:     Joi.string().valid('price_asc', 'price_desc', 'name_asc', 'popular').default('name_asc'),
  }),

  /* GET /d2c/catalog/:slug */
  productSlugParam: Joi.object({
    slug: Joi.string().trim().min(2).max(220).required(),
  }),

  /* POST /d2c/cart — get or create */
  getOrCreateCart: Joi.object({
    session_id: Joi.string().regex(uuidRegex).optional()
      .messages({ 'string.pattern.base': 'session_id must be a valid UUID.' }),
  }),

 
  addItem: Joi.object({
    product_uuid: Joi.string().regex(uuidRegex).required()
      .messages({
        'any.required':        'product_uuid is required.',
        'string.pattern.base': 'product_uuid must be a valid UUID.',
      }),
    quantity: Joi.number().integer().min(1).max(20).required(),
  }),

  /* PATCH /d2c/cart/:cartId/items/:productId */
  updateItem: Joi.object({
    quantity: Joi.number().integer().min(1).max(20).required(),
  }),

  /* /:cartId param */
  cartIdParam: Joi.object({
    cartId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid cart ID.' }),
  }),

  /* /:cartId/items/:productId — productId is UUID (FIX) */
  cartItemParam: Joi.object({
    cartId:    Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid cart ID.' }),
    productId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid product ID — must be a UUID.' }),
  }),

  /* POST /d2c/cart/:cartId/merge */
  mergeCart: Joi.object({
    guest_session_id: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'guest_session_id must be a valid UUID.' }),
  }),

  /* POST /d2c/checkout/:cartId */
  checkout: Joi.object({
    shipping_name:    Joi.string().trim().min(2).max(150).required(),
    shipping_phone:   indianMobile.required(),
    shipping_address: Joi.string().trim().min(10).max(500).required(),
    shipping_city:    Joi.string().trim().max(100).required(),
    shipping_pincode: indianPincode.required(),
    notes:            Joi.string().trim().max(500).optional().allow('', null),
    payment_method:   Joi.string().valid('upi', 'card').required()
      .messages({ 'any.only': 'payment_method must be upi or card.' }),
  }),

  /* GET /d2c/orders */
  ordersQuery: Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(20).default(10),
  }),

  /* GET /d2c/orders/:orderId */
  orderIdParam: Joi.object({
    orderId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid order ID.' }),
  }),

  /* ── Admin CMS validators — SOW §8 "Admin panel (CMS)" ─────────────────── */

  /* PATCH /d2c/cms/products/:productId/availability */
  toggleAvailability: Joi.object({
    productId:     Joi.string().regex(uuidRegex).required(),
    is_available:  Joi.boolean().required()
      .messages({ 'any.required': 'is_available (true/false) is required.' }),
  }),

  /* PATCH /d2c/cms/products/:productId/slug */
  updateSlug: Joi.object({
    productId: Joi.string().regex(uuidRegex).required(),
    slug:      Joi.string().trim().min(2).max(220)
      .pattern(/^[a-z0-9-]+$/)
      .required()
      .messages({
        'any.required':        'slug is required.',
        'string.pattern.base': 'slug must be lowercase, numbers, and hyphens only.',
      }),
  }),
};

module.exports = { d2cValidator };