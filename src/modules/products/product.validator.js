


'use strict';

const Joi = require('joi');
const { PRODUCT_TYPE } = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const slugSchema = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(220)
  .messages({
    'string.pattern.base':
      'Slug must be lowercase letters, numbers, and hyphens only (e.g. cold-brew-classic).',
  });

const uuidParam = Joi.object({
  id: Joi.string()
    .regex(uuidRegex)
    .required()
    .messages({ 'string.pattern.base': 'Invalid ID format.' }),
});

// ─── Category validators ──────────────────────────────────────────────────────

const categoryValidator = {
  create: Joi.object({
    name:          Joi.string().trim().min(2).max(100).required(),
    slug:          slugSchema.optional(),
    parent_id:     Joi.number().integer().positive().optional().allow(null),
    description:   Joi.string().trim().max(500).optional().allow('', null),
    image_url:     Joi.string().uri().max(500).optional().allow('', null),
    display_order: Joi.number().integer().min(0).default(0),
    is_active:     Joi.boolean().default(true),
  }),

  update: Joi.object({
    name:          Joi.string().trim().min(2).max(100).optional(),
    slug:          slugSchema.optional(),
    parent_id:     Joi.number().integer().positive().optional().allow(null),
    description:   Joi.string().trim().max(500).optional().allow('', null),
    image_url:     Joi.string().uri().max(500).optional().allow('', null),
    display_order: Joi.number().integer().min(0).optional(),
    is_active:     Joi.boolean().optional(),
  }).min(1),

  idParam: uuidParam,
};

// ─── Product validators ───────────────────────────────────────────────────────

const productValidator = {
  create: Joi.object({
    category_id:        Joi.number().integer().positive().required(),
    name:               Joi.string().trim().min(2).max(200).required(),
    slug:               slugSchema.optional(),
    description:        Joi.string().trim().max(2000).optional().allow('', null),
    product_type:       Joi.string().valid(...Object.values(PRODUCT_TYPE)).required()
      .messages({ 'any.only': `product_type must be one of: ${Object.values(PRODUCT_TYPE).join(', ')}` }),
    base_price:         Joi.number().precision(2).min(0).required(),
    image_url:          Joi.string().uri().max(500).optional().allow('', null),
    is_customizable:    Joi.boolean().default(false),
    is_available_kiosk: Joi.boolean().default(true),
    is_available_d2c:   Joi.boolean().default(false),
    is_active:          Joi.boolean().default(true),
    display_order:      Joi.number().integer().min(0).default(0),
    meta:               Joi.object().optional().allow(null),
  }),

  update: Joi.object({
    category_id:        Joi.number().integer().positive().optional(),
    name:               Joi.string().trim().min(2).max(200).optional(),
    slug:               slugSchema.optional(),
    description:        Joi.string().trim().max(2000).optional().allow('', null),
    product_type:       Joi.string().valid(...Object.values(PRODUCT_TYPE)).optional(),
    base_price:         Joi.number().precision(2).min(0).optional(),
    image_url:          Joi.string().uri().max(500).optional().allow('', null),
    is_customizable:    Joi.boolean().optional(),
    is_available_kiosk: Joi.boolean().optional(),
    is_available_d2c:   Joi.boolean().optional(),
    is_active:          Joi.boolean().optional(),
    display_order:      Joi.number().integer().min(0).optional(),
    meta:               Joi.object().optional().allow(null),
  }).min(1),

  idParam: uuidParam,

  listQuery: Joi.object({
    page:               Joi.number().integer().min(1).default(1),
    limit:              Joi.number().integer().min(1).max(100).default(20),
    category_id:        Joi.number().integer().positive().optional(),
    product_type:       Joi.string().valid(...Object.values(PRODUCT_TYPE)).optional(),
    is_active:          Joi.boolean().optional(),
    is_available_kiosk: Joi.boolean().optional(),
    is_available_d2c:   Joi.boolean().optional(),
    search:             Joi.string().trim().max(100).optional(),
  }),

  menuQuery: Joi.object({
    channel:     Joi.string().valid('kiosk', 'd2c_website').default('kiosk'),
    store_id:    Joi.number().integer().positive().optional(),
    category_id: Joi.number().integer().positive().optional(),
  }),
};

module.exports = { categoryValidator, productValidator };