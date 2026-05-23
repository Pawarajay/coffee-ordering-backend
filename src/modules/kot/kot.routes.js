


'use strict';

const { Router }       = require('express');
const { kotController } = require('./kot.controller');
const { kotValidator }  = require('./kot.validator');
const { validate }      = require('../../middlewares/validate.middleware');
const { authenticate }  = require('../../middlewares/auth.middleware');
const { isBarista }     = require('../../middlewares/role.middleware');

const router = Router();


router.get(
  '/counts',
  authenticate,
  isBarista,
  kotController.getPendingCount
);

router.get(
  '/',
  authenticate,
  isBarista,
  validate(kotValidator.listQuery, 'query'),
  kotController.getList
);

router.get(
  '/:id',
  authenticate,
  isBarista,
  validate(kotValidator.idParam, 'params'),
  kotController.getById
);

router.get(
  '/:id/history',
  authenticate,
  isBarista,
  validate(kotValidator.idParam, 'params'),
  kotController.getHistory
);

router.post(
  '/:id/print',
  authenticate,
  isBarista,
  validate(kotValidator.idParam, 'params'),
  kotController.markPrinted
);

router.post(
  '/:id/reprint',
  authenticate,
  isBarista,
  validate(kotValidator.idParam, 'params'),
  kotController.reprint
);

router.patch(
  '/:id/status',
  authenticate,
  isBarista,
  validate(kotValidator.idParam, 'params'),
  validate(kotValidator.updateStatus),
  kotController.updateStatus
);

module.exports = router;