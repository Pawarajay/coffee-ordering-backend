
'use strict';

const Joi = require('joi');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ingredientSchema = Joi.object({
  ingredient_id: Joi.number().integer().positive().required().messages({
    'any.required': 'ingredient_id is required.',
    'number.base':  'ingredient_id must be a number.',
  }),
  quantity: Joi.number().positive().required().messages({
    'any.required':   'quantity is required.',
    'number.positive': 'quantity must be positive.',
  }),
});

const customDrinkValidator = {

  create: Joi.object({
    base_product_id: Joi.number().integer().positive().required().messages({
      'any.required': 'base_product_id is required.',
    }),
    name: Joi.string().trim().min(2).max(200).required().messages({
      'any.required': 'Drink name is required.',
      'string.min':   'Drink name must be at least 2 characters.',
      'string.max':   'Drink name must be under 200 characters.',
    }),
    ingredients: Joi.array().items(ingredientSchema).min(1).required().messages({
      'array.min':  'At least one ingredient is required.',
      'any.required': 'ingredients are required.',
    }),
  }),

  update: Joi.object({
    name:         Joi.string().trim().min(2).max(200).optional(),
    ingredients:  Joi.array().items(ingredientSchema).min(1).optional(),
    is_favourite: Joi.boolean().optional(),
  }).min(1),

  reorder: Joi.object({
    store_id: Joi.number().integer().positive().required().messages({
      'any.required': 'store_id is required.',
    }),
    channel: Joi.string()
      .valid('kiosk', 'qr_mobile', 'd2c_website', 'whatsapp', 'admin')
      .default('kiosk'),
  }),

  // NEW: Share validator
  share: Joi.object({
    store_id: Joi.number().integer().positive().optional().allow(null),
  }),

  listQuery: Joi.object({
    page:         Joi.number().integer().min(1).default(1),
    limit:        Joi.number().integer().min(1).max(100).default(20),
    is_favourite: Joi.boolean().optional(),
  }),

  idParam: Joi.object({
    id: Joi.string().regex(uuidRegex).required().messages({
      'string.pattern.base': 'Invalid custom drink ID.',
      'any.required':        'ID is required.',
    }),
  }),
};

module.exports = { customDrinkValidator };