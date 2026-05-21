
'use strict';

const Joi = require('joi');
const { ORDER_STATUS } = require('../../config/constants');

const baseDateRange = {
  store_id:  Joi.number().integer().positive().optional()
    .messages({ 'number.base': 'store_id must be a number.' }),
  date_from: Joi.date().iso().required()
    .messages({ 'any.required': 'date_from is required (ISO format e.g. 2025-01-01).' }),
  date_to: Joi.date().iso().min(Joi.ref('date_from')).required()
    .messages({
      'any.required': 'date_to is required.',
      'date.min':     'date_to must be on or after date_from.',
    }),
};

const basePagination = {
  page:  Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(20),
};

const reportsValidator = {


  summary: Joi.object({
    ...baseDateRange,
    granularity: Joi.string().valid('day', 'week', 'month').default('day'),
  }),

  topProducts: Joi.object({
    ...baseDateRange,
    ...basePagination,
    by: Joi.string().valid('quantity', 'revenue').default('revenue'),
  }),

  topCustomers: Joi.object({
    ...baseDateRange,
    ...basePagination,
  }),

  hourlyHeatmap: Joi.object({
    store_id:  Joi.number().integer().positive().optional(),
    date_from: Joi.date().iso().required(),
    date_to:   Joi.date().iso().min(Joi.ref('date_from')).required(),
  }),

  inventoryConsumption: Joi.object({
    store_id:  Joi.number().integer().positive().optional(),
    date_from: Joi.date().iso().required(),
    date_to:   Joi.date().iso().min(Joi.ref('date_from')).required(),
    limit:     Joi.number().integer().min(1).max(100).default(20),
  }),

  storeComparison: Joi.object({
    date_from: Joi.date().iso().required(),
    date_to:   Joi.date().iso().min(Joi.ref('date_from')).required(),
  }),

  channelBreakdown: Joi.object({
    ...baseDateRange,
  }),

  cancellations: Joi.object({
    ...baseDateRange,
  }),


  customers: Joi.object({
    ...basePagination,
    search:    Joi.string().trim().max(100).optional()
      .description('Search by name, mobile, or email.'),
    date_from: Joi.date().iso().optional()
      .description('Filter customers who registered from this date.'),
    date_to:   Joi.date().iso().optional(),
    is_active: Joi.boolean().optional(),
  }),

 
  customDrinkStats: Joi.object({
    date_from: Joi.date().iso().optional(),
    date_to:   Joi.date().iso().optional(),
    limit:     Joi.number().integer().min(1).max(100).default(20),
  }),

  
  exportParam: Joi.object({
    reportType: Joi.string()
      .valid('top-products', 'top-customers', 'customers', 'cancellations', 'custom-drinks')
      .required()
      .messages({
        'any.only': 'reportType must be one of: top-products, top-customers, customers, cancellations, custom-drinks.',
      }),
  }),

  exportQuery: Joi.object({
    store_id:  Joi.number().integer().positive().optional(),
    date_from: Joi.date().iso().optional(),
    date_to:   Joi.date().iso().optional(),
    search:    Joi.string().trim().max(100).optional(),
    by:        Joi.string().valid('quantity', 'revenue').optional(),
    is_active: Joi.boolean().optional(),
  }),
};

module.exports = { reportsValidator };