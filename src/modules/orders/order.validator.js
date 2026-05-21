
'use strict';

const Joi = require('joi');
const { ORDER_STATUS, ORDER_CHANNEL, PAYMENT_METHOD } = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ingredientSchema = Joi.object({
  ingredient_id: Joi.number().integer().positive().required(),
  quantity:      Joi.number().positive().required(),
});

const orderItemSchema = Joi.object({
  product_id: Joi.string().regex(uuidRegex).required()
    .messages({ 'string.pattern.base': 'product_id must be a valid UUID.' }),
  quantity: Joi.number().integer().min(1).max(20).required(),
  notes: Joi.string().trim().max(300).optional().allow('', null),


  customizations: Joi.alternatives()
    .try(
      Joi.object({
        custom_drink_id: Joi.string().regex(uuidRegex).optional().allow(null),
        name:            Joi.string().trim().max(200).optional().allow('', null),
        ingredients:     Joi.array().items(ingredientSchema).min(1).required(),
      }),
      Joi.array().items(ingredientSchema).min(1)
    )
    .optional()
    .allow(null),
});

const orderValidator = {
  create: Joi.object({
    store_id:        Joi.number().integer().positive().required(),
    channel:         Joi.string().valid(...Object.values(ORDER_CHANNEL)).required()
      .messages({ 'any.only': `channel must be one of: ${Object.values(ORDER_CHANNEL).join(', ')}` }),
    items:           Joi.array().items(orderItemSchema).min(1).required()
      .messages({ 'array.min': 'At least one item is required.' }),
    notes:           Joi.string().trim().max(500).optional().allow('', null),
    discount_amount: Joi.number().min(0).precision(2).optional().default(0),
  }),

  updateStatus: Joi.object({
    status: Joi.string().valid(...Object.values(ORDER_STATUS)).required(),
    notes:  Joi.string().trim().max(300).optional().allow('', null),
  }),

  cancel: Joi.object({
    reason: Joi.string().trim().max(300).optional().allow('', null),
  }),

  listQuery: Joi.object({
    page:                    Joi.number().integer().min(1).default(1),
    limit:                   Joi.number().integer().min(1).max(100).default(20),
    store_id:                Joi.number().integer().positive().optional(),
    status:                  Joi.string().valid(...Object.values(ORDER_STATUS)).optional(),
    channel:                 Joi.string().valid(...Object.values(ORDER_CHANNEL)).optional(),
    customer_id:             Joi.string().regex(uuidRegex).optional(),
    date_from:               Joi.date().iso().optional(),
    date_to:                 Joi.date().iso().optional(),
    is_synced_to_accounting: Joi.boolean().optional(),
  }),

  idParam: Joi.object({
    id: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid order ID.' }),
  }),

  initiatePayment: Joi.object({
    method: Joi.string().valid(...Object.values(PAYMENT_METHOD)).required(),
  }),

  recordPayment: Joi.object({
    amount:             Joi.number().precision(2).positive().required(),
    method:             Joi.string().valid(...Object.values(PAYMENT_METHOD)).required(),
    gateway_order_id:   Joi.string().max(150).optional().allow('', null),
    gateway_payment_id: Joi.string().max(150).optional().allow('', null),
    gateway_signature:  Joi.string().max(300).optional().allow('', null),
  }),

  markAccountingSynced: Joi.object({
    order_ids: Joi.array().items(Joi.string().regex(uuidRegex)).min(1).required()
      .messages({ 'array.min': 'At least one order ID is required.' }),
  }),
};

module.exports = { orderValidator };