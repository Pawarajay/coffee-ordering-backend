'use strict';

const { adminService } = require('./admin.service');
const Response = require('../../utils/response');

const adminController = {

  async listUsers(req, res, next) {
    try {
      const result = await adminService.listUsers(req.query);
      return Response.ok(res, result.users, 'Users fetched.', result.meta);
    } catch (err) {
      return next(err);
    }
  },

  async getUserById(req, res, next) {
    try {
      const user = await adminService.getUserById(req.params.id);
      return Response.ok(res, user, 'User fetched.');
    } catch (err) {
      return next(err);
    }
  },

  async updateUserStatus(req, res, next) {
    try {
      const { is_active, reason } = req.body;
      const user = await adminService.updateUserStatus(
        req.params.id, is_active, reason, req.user.id
      );
      const msg = is_active ? 'User activated.' : 'User deactivated.';
      return Response.ok(res, user, msg);
    } catch (err) {
      return next(err);
    }
  },

  async updateUserRole(req, res, next) {
    try {
      const { role, store_id } = req.body;
      const user = await adminService.updateUserRole(
        req.params.id, role, store_id, req.user.id
      );
      return Response.ok(res, user, 'User role updated.');
    } catch (err) {
      return next(err);
    }
  },

  async getUserOrders(req, res, next) {
    try {
      const result = await adminService.getUserOrders(req.params.id, req.query);
      return Response.ok(res, result.orders, 'User orders fetched.', result.meta);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = { adminController };