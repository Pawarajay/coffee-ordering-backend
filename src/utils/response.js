'use strict';



/**
 * Send a success response.
 * @param {import('express').Response} res
 * @param {object} opts
 * @param {any}    opts.data     - Response payload
 * @param {string} opts.message  - Human-readable message
 * @param {number} opts.status   - HTTP status code (default 200)
 * @param {object} opts.meta     - Pagination / extra metadata
 */
function sendSuccess(res, { data = null, message = 'Success', status = 200, meta = null } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta,
    errors: null,
  });
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {object} opts
 * @param {string} opts.message  - Human-readable error message
 * @param {number} opts.status   - HTTP status code (default 500)
 * @param {array}  opts.errors   - Array of field-level errors (Joi, etc.)
 * @param {string} opts.code     - App-level error code for client handling
 */
function sendError(res, { message = 'Something went wrong', status = 500, errors = null, code = null } = {}) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    meta: null,
    errors,
    code,
  });
}

/**
 * Shorthand helpers (mirrors common HTTP patterns used in controllers)
 */
const Response = {
  ok: (res, data, message = 'Success', meta = null) =>
    sendSuccess(res, { data, message, status: 200, meta }),

  created: (res, data, message = 'Created successfully') =>
    sendSuccess(res, { data, message, status: 201 }),

  noContent: (res) => res.status(204).send(),

  badRequest: (res, message = 'Bad request', errors = null) =>
    sendError(res, { message, status: 400, errors }),

  unauthorized: (res, message = 'Unauthorized') =>
    sendError(res, { message, status: 401, code: 'UNAUTHORIZED' }),

  forbidden: (res, message = 'Access denied') =>
    sendError(res, { message, status: 403, code: 'FORBIDDEN' }),

  notFound: (res, message = 'Resource not found') =>
    sendError(res, { message, status: 404, code: 'NOT_FOUND' }),

  conflict: (res, message = 'Conflict') =>
    sendError(res, { message, status: 409, code: 'CONFLICT' }),

  unprocessable: (res, message = 'Validation failed', errors = null) =>
    sendError(res, { message, status: 422, errors, code: 'VALIDATION_ERROR' }),

  tooMany: (res, message = 'Too many requests') =>
    sendError(res, { message, status: 429, code: 'RATE_LIMIT_EXCEEDED' }),

  serverError: (res, message = 'Internal server error') =>
    sendError(res, { message, status: 500, code: 'SERVER_ERROR' }),
};

module.exports = Response;