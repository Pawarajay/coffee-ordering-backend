'use strict';

const authService = require('./auth.service');
const Response = require('../../utils/response');


const authController = {

  async sendOTP(req, res, next) {
    try {
      const { mobile } = req.body;
      const result = await authService.sendOTP(mobile);
      return Response.ok(res, null, result.message);
    } catch (err) {
      return next(err);
    }
  },

 
  async verifyOTP(req, res, next) {
    try {
      const { mobile, otp } = req.body;
      const meta = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };
      const result = await authService.verifyOTPAndLogin(mobile, otp, meta);
      return Response.ok(res, result, 'Login successful.');
    } catch (err) {
      return next(err);
    }
  },


  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refreshAccessToken(refreshToken);
      return Response.ok(res, result, 'Token refreshed.');
    } catch (err) {
      return next(err);
    }
  },

  /**
   * POST /api/v1/auth/logout
   * Protected route — revoke the refresh token.
   */
  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.logout(refreshToken);
      return Response.ok(res, null, result.message);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * GET /api/v1/auth/me
   * Protected route — return current user info.
   */
  async me(req, res) {
    // req.user is already populated by authenticate middleware
    return Response.ok(res, req.user, 'Authenticated user info.');
  },

  /**
   * PATCH /api/v1/auth/profile
   * Protected route — update name / email.
   */
  async updateProfile(req, res, next) {
    try {
      const updated = await authService.updateProfile(req.user.id, req.body);
      return Response.ok(res, updated, 'Profile updated successfully.');
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = authController;