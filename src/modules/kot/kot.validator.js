

'use strict';

const Joi              = require('joi');
const { KOT_STATUS }   = require('../../config/constants');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const kotValidator = {

  
  listQuery: Joi.object({
    page:     Joi.number().integer().min(1).default(1),
    limit:    Joi.number().integer().min(1).max(100).default(50),
    store_id: Joi.number().integer().positive().optional(),
    status:   Joi.string().valid(...Object.values(KOT_STATUS)).optional(),
    date:     Joi.date().iso().optional(),
  }),


  updateStatus: Joi.object({
    status: Joi.string()
      .valid(...Object.values(KOT_STATUS))
      .required()
      .messages({
        'any.only': `status must be one of: ${Object.values(KOT_STATUS).join(', ')}`,
      }),
  }),

  idParam: Joi.object({
    id: Joi.string()
      .regex(uuidRegex)
      .required()
      .messages({ 'string.pattern.base': 'Invalid KOT ID.' }),
  }),
};

module.exports = { kotValidator };