

'use strict';

const Joi = require('joi');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ingredientUsageItem = Joi.object({
  ingredient_id: Joi.number().integer().positive().required()
    .messages({ 'any.required': 'ingredient_id is required for each raw material.' }),
  quantity_used: Joi.number().positive().required()
    .messages({ 'any.required': 'quantity_used is required per raw material.' }),
 
  unit: Joi.string().trim().max(20).optional().allow('', null),
});

const productionValidator = {

  createBatch: Joi.object({
    product_id:    Joi.number().integer().positive().required()
      .messages({ 'any.required': 'product_id (the finished product) is required.' }),
    quantity_ml:   Joi.number().positive().required()
      .messages({ 'any.required': 'quantity_ml (total output in ML) is required.' }),
    raw_materials: Joi.array().items(ingredientUsageItem).min(1).required()
      .messages({
        'array.min':    'At least one raw material entry is required.',
        'any.required': 'raw_materials is required.',
      }),
    produced_at: Joi.date().iso().max('now').default(() => new Date())
      .messages({ 'date.max': 'produced_at cannot be in the future.' }),
    notes: Joi.string().trim().max(1000).optional().allow('', null),
  }),
  listBatches: Joi.object({
    page:       Joi.number().integer().min(1).default(1),
    limit:      Joi.number().integer().min(1).max(100).default(20),
    product_id: Joi.number().integer().positive().optional(),
    date_from:  Joi.date().iso().optional(),
    date_to:    Joi.date().iso().optional(),
    search:     Joi.string().trim().max(100).optional(),
  }),

  batchIdParam: Joi.object({
    id: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'Invalid batch ID — must be a valid UUID.' }),
  }),


  distribute: Joi.object({
    batch_uuid: Joi.string().regex(uuidRegex).required()
      .messages({
        'any.required':        'batch_uuid is required.',
        'string.pattern.base': 'batch_uuid must be a valid UUID.',
      }),
    channel: Joi.string()
      .valid('kiosk', 'd2c', 'b2b')
      .required()
      .messages({ 'any.only': 'channel must be one of: kiosk, d2c, b2b.' }),
    destination_store_id: Joi.when('channel', {
      is:        Joi.valid('kiosk', 'b2b'),
      then:      Joi.number().integer().positive().required()
        .messages({ 'any.required': 'destination_store_id is required for kiosk and b2b channels.' }),
      otherwise: Joi.number().integer().positive().optional().allow(null),
    }),
    quantity_ml: Joi.number().positive().required()
      .messages({ 'any.required': 'quantity_ml to distribute is required.' }),
    notes: Joi.string().trim().max(500).optional().allow('', null),
  }),

  distributionQuery: Joi.object({
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    batch_id:  Joi.number().integer().positive().optional(),
    store_id:  Joi.number().integer().positive().optional(),
    channel:   Joi.string().valid('kiosk', 'd2c', 'b2b').optional(),
    date_from: Joi.date().iso().optional(),
    date_to:   Joi.date().iso().optional(),
  }),

  rawMaterialStockIn: Joi.object({
    ingredient_id: Joi.number().integer().positive().required()
      .messages({ 'any.required': 'ingredient_id is required.' }),
    quantity: Joi.number().positive().required()
      .messages({ 'any.required': 'quantity is required.' }),
    notes: Joi.string().trim().max(500).optional().allow('', null),
  }),

  rawMaterialQuery: Joi.object({
    page:   Joi.number().integer().min(1).default(1),
    limit:  Joi.number().integer().min(1).max(200).default(50),
    search: Joi.string().trim().max(100).optional(),
  }),
};

module.exports = { productionValidator };