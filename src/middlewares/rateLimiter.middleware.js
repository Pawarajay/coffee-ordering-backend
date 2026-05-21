'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const Response = require('../utils/response');


const generalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,   
  legacyHeaders: false,
  handler: (req, res) => Response.tooMany(res, 'Too many requests, please slow down.'),
});


const otpLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.otpMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    Response.tooMany(res, 'Too many OTP requests. Please try again after 15 minutes.'),
  keyGenerator: (req) => `${req.ip}_${req.body?.mobile || 'unknown'}`,
});

module.exports = { generalLimiter, otpLimiter };