'use strict';

const { Router } = require('express');
const authController = require('./auth.controller');
const authValidator = require('./auth.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { otpLimiter } = require('../../middlewares/rateLimiter.middleware');

const router = Router();

router.post(
  '/send-otp',
  otpLimiter,                     
  validate(authValidator.sendOTP),
  authController.sendOTP
);

router.post(
  '/verify-otp',
  validate(authValidator.verifyOTP),
  authController.verifyOTP
);

router.post(
  '/login-email',
  validate(authValidator.loginEmail),
  authController.loginEmail
);

router.post(
  '/refresh-token',
  validate(authValidator.refreshToken),
  authController.refreshToken
);

// ── Protected ─────────────────────────────────────────────────────────────────
router.post(
  '/logout',
  authenticate,
  validate(authValidator.logout),
  authController.logout
);

router.get(
  '/me',
  authenticate,
  authController.me
);

router.patch(
  '/profile',
  authenticate,
  validate(authValidator.updateProfile),
  authController.updateProfile
);

module.exports = router;