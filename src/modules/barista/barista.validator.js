

'use strict';

const Joi = require('joi');


const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const baristaValidator = {

  queueQuery: Joi.object({
    store_id:             Joi.number().integer().positive().optional(),
    include_done_minutes: Joi.number().integer().min(0).max(60).default(0),
  }),

  idParam: Joi.object({
    id: Joi.string()
      .regex(uuidRegex)
      .required()
      .messages({ 'string.pattern.base': 'Invalid ID — must be a valid UUID.' }),
  }),

  cancelOrder: Joi.object({
    reason: Joi.string().trim().max(300).optional().allow('', null),
  }),
};

module.exports = { baristaValidator };