
'use strict';

const Joi = require('joi');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


const dayHoursSchema = Joi.alternatives().try(
  Joi.object({
    open:  Joi.string().pattern(/^\d{2}:\d{2}$/).required()
      .messages({ 'string.pattern.base': 'open time must be in HH:MM format.' }),
    close: Joi.string().pattern(/^\d{2}:\d{2}$/).required()
      .messages({ 'string.pattern.base': 'close time must be in HH:MM format.' }),
  }),
  Joi.valid(null) 
);

const operatingHoursSchema = Joi.object({
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
  sat: dayHoursSchema,
  sun: dayHoursSchema,
}).optional();

const storeConfigSchema = Joi.object({
  tax_rate:            Joi.number().min(0).max(1).optional(),
  currency:            Joi.string().length(3).uppercase().optional(),
  kiosk_enabled:       Joi.boolean().optional(),
  is_central_kitchen:  Joi.boolean().optional(),
}).optional().allow(null);


const storeValidator = {

  /* POST /stores */
  create: Joi.object({
    name:     Joi.string().trim().min(2).max(150).required(),
    address:  Joi.string().trim().max(500).optional().allow('', null),
    city:     Joi.string().trim().max(100).optional().allow('', null),
    state:    Joi.string().trim().max(100).optional().allow('', null),
    pincode:  Joi.string().trim().max(10).optional().allow('', null),
    phone:    Joi.string().trim().max(15).optional().allow('', null),
    email:    Joi.string().email().lowercase().trim().optional().allow('', null),
    timezone: Joi.string().max(50).default('Asia/Kolkata'),
    is_active:       Joi.boolean().default(true),
    operating_hours: operatingHoursSchema,
    config:          storeConfigSchema,
  }),

  /* PATCH /stores/:id */
  update: Joi.object({
    name:     Joi.string().trim().min(2).max(150).optional(),
    address:  Joi.string().trim().max(500).optional().allow('', null),
    city:     Joi.string().trim().max(100).optional().allow('', null),
    state:    Joi.string().trim().max(100).optional().allow('', null),
    pincode:  Joi.string().trim().max(10).optional().allow('', null),
    phone:    Joi.string().trim().max(15).optional().allow('', null),
    email:    Joi.string().email().lowercase().trim().optional().allow('', null),
    timezone: Joi.string().max(50).optional(),
    is_active: Joi.boolean().optional(),
  }).min(1).messages({ 'object.min': 'At least one field must be provided.' }),

  /* PATCH /stores/:id/hours */
  updateHours: Joi.object({
    operating_hours: operatingHoursSchema.required(),
  }),

  /* PATCH /stores/:id/config */
  updateConfig: Joi.object({
    config: storeConfigSchema.required(),
  }),

  /* POST /stores/:id/staff — assign */
  assignStaff: Joi.object({
    user_id: Joi.number().integer().positive().required(),
    role: Joi.string()
      .valid('store_manager', 'barista')
      .required()
      .messages({ 'any.only': 'role must be store_manager or barista.' }),
  }),

 
  setMenuOverride: Joi.object({
    is_available:   Joi.boolean().required()
      .messages({ 'any.required': 'is_available is required.' }),
    override_price: Joi.number().positive().optional().allow(null)
      .description('Store-specific price override. Null = use global price.'),
  }),

  /* GET /stores */
  listQuery: Joi.object({
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    is_active: Joi.boolean().optional(),
    city:      Joi.string().trim().max(100).optional(),
  }),

  /* /:id — integer store ID */
  idParam: Joi.object({
    id: Joi.number().integer().positive().required()
      .messages({ 'number.base': 'Store ID must be a number.' }),
  }),

  /* /:id/staff/:userId */
  staffParam: Joi.object({
    id:     Joi.number().integer().positive().required(),
    userId: Joi.number().integer().positive().required()
      .messages({ 'number.base': 'userId must be a positive integer.' }),
  }),

  menuOverrideParam: Joi.object({
    id:        Joi.number().integer().positive().required(),
    productId: Joi.string().regex(uuidRegex).required()
      .messages({ 'string.pattern.base': 'productId must be a valid UUID.' }),
  }),
};

module.exports = { storeValidator };