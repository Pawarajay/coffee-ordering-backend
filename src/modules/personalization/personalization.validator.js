

'use strict';

const Joi = require('joi');
const { ORDER_STATUS, ORDER_CHANNEL } = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const personalizationValidator = {

  orderHistoryQuery: Joi.object({
    page:   Joi.number().integer().min(1).default(1),
    limit:  Joi.number().integer().min(1).max(50).default(10),
    status: Joi.string().valid(...Object.values(ORDER_STATUS)).optional(),
  }),

  topOrdersQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(20).default(5),
  }),
  recentDrinksQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(10).default(5),
  }),

  reorderFromOrderParam: Joi.object({
    orderId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid order ID.' }),
  }),

  reorderFromDrinkParam: Joi.object({
    drinkId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid custom drink ID.' }),
  }),

  reorderBody: Joi.object({
    store_id: Joi.number().integer().positive().required()
      .messages({ 'any.required': 'store_id is required to place the reorder.' }),
    channel: Joi.string()
      .valid(...Object.values(ORDER_CHANNEL))
      .default('qr_mobile'),
  }),
};

module.exports = { personalizationValidator };