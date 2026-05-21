

'use strict';

const { Router } = require('express');
const { orderController } = require('./order.controller');
const { orderValidator } = require('./order.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate, optionalAuthenticate } = require('../../middlewares/auth.middleware');
const { isStaff, isAdmin } = require('../../middlewares/role.middleware');

const router = Router();


router.post(
  '/',
  optionalAuthenticate,
  validate(orderValidator.create),
  orderController.create
);


router.get(
  '/me',
  authenticate,
  validate(orderValidator.listQuery, 'query'),
  orderController.getMyOrders
);

router.get(
  '/accounting/unsynced',
  authenticate,
  isAdmin,
  validate(orderValidator.listQuery, 'query'),
  orderController.getUnsyncedForAccounting
);

router.patch(
  '/accounting/mark-synced',
  authenticate,
  isAdmin,
  validate(orderValidator.markAccountingSynced),
  orderController.markAccountingSynced
);

router.get(
  '/',
  authenticate,
  isStaff,
  validate(orderValidator.listQuery, 'query'),
  orderController.getList
);

router.get(
  '/:id',
  validate(orderValidator.idParam, 'params'),
  orderController.getById
);

router.patch(
  '/:id/status',
  authenticate,
  isStaff,
  validate(orderValidator.idParam, 'params'),
  validate(orderValidator.updateStatus),
  orderController.updateStatus
);

router.post(
  '/:id/cancel',
  authenticate,
  validate(orderValidator.idParam, 'params'),
  validate(orderValidator.cancel),
  orderController.cancel
);

router.post(
  '/:id/discard',
  authenticate,
  validate(orderValidator.idParam, 'params'),
  orderController.discardAndReorder
);

router.post(
  '/:id/payment/initiate',
  authenticate,
  validate(orderValidator.idParam, 'params'),
  validate(orderValidator.initiatePayment),
  orderController.initiatePayment
);

router.post(
  '/:id/payment',
  authenticate,
  isStaff,
  validate(orderValidator.idParam, 'params'),
  validate(orderValidator.recordPayment),
  orderController.recordPayment
);

module.exports = router;