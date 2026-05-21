

'use strict';

const Joi = require('joi');
const { UNIT_TYPE } = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidParam = Joi.object({
  id: Joi.string().regex(uuidRegex).required().messages({
    'string.pattern.base': 'Invalid ID format.',
  }),
});


const ingredientValidator = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(150).required(),
    unit: Joi.string()
      .valid(...Object.values(UNIT_TYPE))
      .required()
      .messages({ 'any.only': `unit must be one of: ${Object.values(UNIT_TYPE).join(', ')}` }),
    cost_per_unit: Joi.number().precision(4).min(0).required().messages({
      'any.required': 'Cost per unit is required.',
    }),
    low_stock_threshold:      Joi.number().min(0).default(100),
    critical_stock_threshold: Joi.number().min(0).default(20),
    is_active: Joi.boolean().default(true),
  }),

  update: Joi.object({
    name:                     Joi.string().trim().min(2).max(150).optional(),
    unit:                     Joi.string().valid(...Object.values(UNIT_TYPE)).optional(),
    cost_per_unit:            Joi.number().precision(4).min(0).optional(),
    low_stock_threshold:      Joi.number().min(0).optional(),
    critical_stock_threshold: Joi.number().min(0).optional(),
    is_active:                Joi.boolean().optional(),
  }).min(1),

  idParam: uuidParam,

  listQuery: Joi.object({
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(50),
    is_active: Joi.boolean().optional(),
    search:    Joi.string().trim().max(100).optional(),
  }),
};


const ingredientGroupValidator = {
  create: Joi.object({
    name:           Joi.string().trim().min(2).max(100).required(),
    description:    Joi.string().trim().max(255).optional().allow('', null),
    selection_type: Joi.string().valid('single', 'multiple').default('single'),
    is_required:    Joi.boolean().default(false),
    display_order:  Joi.number().integer().min(0).default(0),
    is_active:      Joi.boolean().default(true),
  }),

  update: Joi.object({
    name:           Joi.string().trim().min(2).max(100).optional(),
    description:    Joi.string().trim().max(255).optional().allow('', null),
    selection_type: Joi.string().valid('single', 'multiple').optional(),
    is_required:    Joi.boolean().optional(),
    display_order:  Joi.number().integer().min(0).optional(),
    is_active:      Joi.boolean().optional(),
  }).min(1),

  idParam: uuidParam,
};


const ingredientMappingValidator = {
  create: Joi.object({
    ingredient_id:  Joi.number().integer().positive().required(),
    group_id:       Joi.number().integer().positive().optional().allow(null),
    quantity:       Joi.number().positive().required(),
    is_default:     Joi.boolean().default(true),
    is_optional:    Joi.boolean().default(false),
    price_override: Joi.number().precision(2).min(0).optional().allow(null),
    min_qty:        Joi.number().min(0).default(0),
    max_qty:        Joi.number().positive().optional().allow(null),
    step_qty:       Joi.number().positive().default(1),
  }),

  update: Joi.object({
    group_id:       Joi.number().integer().positive().optional().allow(null),
    quantity:       Joi.number().positive().optional(),
    is_default:     Joi.boolean().optional(),
    is_optional:    Joi.boolean().optional(),
    price_override: Joi.number().precision(2).min(0).optional().allow(null),
    min_qty:        Joi.number().min(0).optional(),
    max_qty:        Joi.number().positive().optional().allow(null),
    step_qty:       Joi.number().positive().optional(),
  }).min(1),

  bulk: Joi.object({
    ingredients: Joi.array()
      .items(
        Joi.object({
          ingredient_id:  Joi.number().integer().positive().required(),
          group_id:       Joi.number().integer().positive().optional().allow(null),
          quantity:       Joi.number().positive().required(),
          is_default:     Joi.boolean().default(true),
          is_optional:    Joi.boolean().default(false),
          price_override: Joi.number().precision(2).min(0).optional().allow(null),
          min_qty:        Joi.number().min(0).default(0),
          max_qty:        Joi.number().positive().optional().allow(null),
          step_qty:       Joi.number().positive().default(1),
        })
      )
      .min(1)
      .required(),
  }),

  productIdParam: Joi.object({
    productId: Joi.string().regex(uuidRegex).required().messages({
      'string.pattern.base': 'productId must be a valid UUID.',
    }),
  }),

  mappingParam: Joi.object({
    productId: Joi.string().regex(uuidRegex).required().messages({
      'string.pattern.base': 'productId must be a valid UUID.',
    }),
    ingredientId: Joi.number().integer().positive().required(),
  }),

  // NEW: Price preview validator
  pricePreview: Joi.object({
    ingredients: Joi.array()
      .items(
        Joi.object({
          ingredient_id: Joi.number().integer().positive().required().messages({
            'any.required': 'ingredient_id is required.',
          }),
          quantity: Joi.number().positive().required().messages({
            'any.required': 'quantity is required.',
            'number.positive': 'quantity must be positive.',
          }),
        })
      )
      .min(1)
      .required()
      .messages({
        'array.min': 'At least one ingredient is required.',
        'any.required': 'ingredients array is required.',
      }),
  }),
};

module.exports = {
  ingredientValidator,
  ingredientGroupValidator,
  ingredientMappingValidator,
};