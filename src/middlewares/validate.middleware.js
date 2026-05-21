'use strict';

const Response = require('../utils/response');

/**
 * Joi validation middleware factory.
 *
 * Usage in a route file:
 *   router.post('/send-otp', validate(authValidator.sendOTP), authController.sendOTP);
 *
 * @param {import('joi').Schema} schema  - Joi schema
 * @param {'body'|'query'|'params'} target - Which part of req to validate
 * @returns {import('express').RequestHandler}
 */
function validate(schema, target = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,      // Return all errors at once
      stripUnknown: true,     // Drop fields not in schema
      convert: true,          // Coerce types (string "1" → number 1)
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''), // Clean Joi quotes
      }));
      return Response.unprocessable(res, 'Validation failed', errors);
    }

    // Replace req[target] with the sanitized value
    req[target] = value;
    return next();
  };
}

module.exports = { validate };