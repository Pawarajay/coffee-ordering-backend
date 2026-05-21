

'use strict';

const Joi = require('joi');
const { INVENTORY_TXN_TYPE, STOCK_ALERT } = require('../../config/constants');

const inventoryValidator = {

  
  listQuery: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(200).default(50),
    store_id:    Joi.number().integer().positive().required()
      .messages({ 'any.required': 'store_id is required.' }),
    alert_level: Joi.string()
      .valid(...Object.values(STOCK_ALERT), 'all')
      .default('all'),
    search:      Joi.string().trim().max(100).optional(),
  }),

  stockIn: Joi.object({
    store_id:      Joi.number().integer().positive().required(),
    ingredient_id: Joi.number().integer().positive().required(),
    quantity:      Joi.number().positive().required()
      .messages({ 'number.positive': 'Quantity must be greater than zero.' }),
    notes:         Joi.string().trim().max(500).optional().allow('', null),
    reference_id:  Joi.number().integer().positive().optional().allow(null),
  }),


  adjust: Joi.object({
    store_id:      Joi.number().integer().positive().required(),
    ingredient_id: Joi.number().integer().positive().required(),
    new_quantity:  Joi.number().min(0).required()
      .messages({ 'any.required': 'new_quantity is the correct count after adjustment.' }),
    notes:         Joi.string().trim().max(500).required()
      .messages({ 'any.required': 'A reason for the adjustment is required.' }),
  }),

  
  wastage: Joi.object({
    store_id:      Joi.number().integer().positive().required(),
    ingredient_id: Joi.number().integer().positive().required(),
    quantity:      Joi.number().positive().required(),
    notes:         Joi.string().trim().max(500).required()
      .messages({ 'any.required': 'A reason for wastage is required.' }),
  }),

  transactionQuery: Joi.object({
    page:          Joi.number().integer().min(1).default(1),
    limit:         Joi.number().integer().min(1).max(100).default(20),
    store_id:      Joi.number().integer().positive().required(),
    ingredient_id: Joi.number().integer().positive().optional(),
    txn_type:      Joi.string().valid(...Object.values(INVENTORY_TXN_TYPE)).optional(),
    date_from:     Joi.date().iso().optional(),
    date_to:       Joi.date().iso().optional(),
  }),

  
  alertQuery: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(100).default(20),
    store_id:    Joi.number().integer().positive().required(),
    alert_type:  Joi.string().valid(...Object.values(STOCK_ALERT)).optional(),
    is_resolved: Joi.boolean().default(false),
  }),

 
  alertIdParam: Joi.object({
    id: Joi.number().integer().positive().required(),
  }),

  
  centralRawMaterialIn: Joi.object({
    facility_id:   Joi.number().integer().positive().required()
      .messages({ 'any.required': 'facility_id is required.' }),
    ingredient_id: Joi.number().integer().positive().required(),
    quantity:      Joi.number().positive().required()
      .messages({ 'number.positive': 'Quantity must be greater than zero.' }),
    notes:         Joi.string().trim().max(500).optional().allow('', null),
    reference_id:  Joi.number().integer().positive().optional().allow(null)
      .description('Purchase order ID if applicable'),
  }),

  
  createProductionBatch: Joi.object({
    facility_id:        Joi.number().integer().positive().required(),
    product_id:         Joi.number().integer().positive().required()
      .messages({ 'any.required': 'product_id (finished product) is required.' }),
    output_quantity_ml: Joi.number().positive().required()
      .messages({ 'any.required': 'output_quantity_ml is required (total ML produced).' }),
    output_units:       Joi.number().integer().positive().required()
      .messages({ 'any.required': 'output_units is required (sellable units produced).' }),
    raw_materials: Joi.array().items(
      Joi.object({
        ingredient_id:  Joi.number().integer().positive().required(),
        quantity_used:  Joi.number().positive().required()
          .messages({ 'any.required': 'quantity_used per raw material is required.' }),
      })
    ).min(1).required()
      .messages({ 'array.min': 'At least one raw material is required.' }),
    batch_notes: Joi.string().trim().max(500).optional().allow('', null),
  }),

  
  productionBatchQuery: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(100).default(20),
    facility_id: Joi.number().integer().positive().required()
      .messages({ 'any.required': 'facility_id is required.' }),
    status:      Joi.string()
      .valid('produced', 'partially_distributed', 'fully_distributed')
      .optional(),
  }),

  distributeToChannel: Joi.object({
    facility_id:    Joi.number().integer().positive().required(),
    batch_uuid:     Joi.string().guid().required()
      .messages({ 'any.required': 'batch_uuid is required (production batch to ship from).' }),
    channel:        Joi.string()
      .valid('kiosk', 'd2c', 'b2b')
      .required()
      .messages({ 'any.only': 'channel must be one of: kiosk, d2c, b2b.' }),
    store_id:       Joi.number().integer().positive()
      .when('channel', {
        is:       'kiosk',
        then:     Joi.required()
          .messages({ 'any.required': 'store_id is required for kiosk channel.' }),
        otherwise: Joi.optional().allow(null),
      }),
    quantity_units: Joi.number().integer().positive().required()
      .messages({ 'any.required': 'quantity_units to distribute is required.' }),
    notes:          Joi.string().trim().max(500).optional().allow('', null),
  }),

  distributionOrderQuery: Joi.object({
    page:        Joi.number().integer().min(1).default(1),
    limit:       Joi.number().integer().min(1).max(100).default(20),
    facility_id: Joi.number().integer().positive().required()
      .messages({ 'any.required': 'facility_id is required.' }),
    channel:     Joi.string().valid('kiosk', 'd2c', 'b2b').optional(),
    store_id:    Joi.number().integer().positive().optional(),
  }),
};

module.exports = { inventoryValidator };