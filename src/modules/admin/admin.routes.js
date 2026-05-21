'use strict';

const { Router } = require('express');
const { adminController } = require('./admin.controller');
const { adminValidator } = require('./admin.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin, isSuperAdmin } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/users',
  authenticate,
  isAdmin,
  validate(adminValidator.listUsers, 'query'),
  adminController.listUsers
);

router.get(
  '/users/:id',
  authenticate,
  isAdmin,
  validate(adminValidator.idParam, 'params'),
  adminController.getUserById
);

router.patch(
  '/users/:id/status',
  authenticate,
  isAdmin,
  validate(adminValidator.idParam, 'params'),
  validate(adminValidator.updateStatus),
  adminController.updateUserStatus
);

router.patch(
  '/users/:id/role',
  authenticate,
  isSuperAdmin,
  validate(adminValidator.idParam, 'params'),
  validate(adminValidator.updateRole),
  adminController.updateUserRole
);

router.get(
  '/users/:id/orders',
  authenticate,
  isAdmin,
  validate(adminValidator.idParam, 'params'),
  validate(adminValidator.listQuery, 'query'),
  adminController.getUserOrders
);

module.exports = router;