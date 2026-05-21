'use strict';

const Joi = require('joi');
const { ROLES } = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adminValidator = {

  idParam: Joi.object({
    id: Joi.string().regex(uuidRegex).required().messages({
      'string.pattern.base': 'Invalid user ID.',
    }),
  }),

  listUsers: Joi.object({
    page:      Joi.number().integer().min(1).default(1),
    limit:     Joi.number().integer().min(1).max(100).default(20),
    role:      Joi.string().valid(...Object.values(ROLES)).optional(),
    is_active: Joi.boolean().optional(),
    search:    Joi.string().trim().max(100).optional(),
    store_id:  Joi.number().integer().positive().optional(),
  }),

  updateStatus: Joi.object({
    is_active: Joi.boolean().required().messages({
      'any.required': 'is_active is required (true to activate, false to deactivate).',
    }),
    reason: Joi.string().trim().max(300).optional().allow('', null),
  }),

  updateRole: Joi.object({
    role: Joi.string()
      .valid(
        ROLES.ADMIN,
        ROLES.STORE_MANAGER,
        ROLES.BARISTA,
        ROLES.CUSTOMER
      )
      .required()
      .messages({
        'any.required': 'role is required.',
        'any.only': `role must be one of: admin, store_manager, barista, customer`,
      }),
    store_id: Joi.number().integer().positive().optional().allow(null),
  }),

  listQuery: Joi.object({
    page:  Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = { adminValidator };