'use strict';

const logger = require('../utils/logger');
const Response = require('../utils/response');
const env = require('../config/env');


class AppError extends Error {
  constructor(message, statusCode = 500, code = null, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
}


function globalErrorHandler(err, req, res, next) {
  if (err.isOperational) {
    logger.warn(`[AppError] ${err.statusCode} — ${err.message}`, {
      url: req.originalUrl,
      method: req.method,
    });
    return Response.serverError;
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry — this record already exists.',
      data: null,
      errors: null,
      code: 'DUPLICATE_ENTRY',
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      success: false,
      message: 'Referenced resource does not exist.',
      data: null,
      errors: null,
      code: 'FOREIGN_KEY_VIOLATION',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return Response.unauthorized(res, 'Invalid token.');
  }

  if (err.name === 'TokenExpiredError') {
    return Response.unauthorized(res, 'Token expired. Please log in again.');
  }

  logger.error('[Unhandled Error]', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
  });

  const message = env.IS_PRODUCTION ? 'Internal server error' : err.message;
  return res.status(err.statusCode || 500).json({
    success: false,
    message,
    data: null,
    errors: null,
    code: err.code || 'SERVER_ERROR',
    ...(env.IS_PRODUCTION ? {} : { stack: err.stack }),
  });
}

module.exports = { AppError, notFoundHandler, globalErrorHandler };