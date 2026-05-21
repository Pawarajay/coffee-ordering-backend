

'use strict';

const { Router }          = require('express');
const { baristaController } = require('./barista.controller');
const { baristaValidator }  = require('./barista.validator');
const { validate }          = require('../../middlewares/validate.middleware');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { isBarista }         = require('../../middlewares/role.middleware');

const router = Router();


router.get(
  '/queue',
  authenticate,
  isBarista,
  validate(baristaValidator.queueQuery, 'query'),
  baristaController.getQueue
);

router.patch(
  '/kot/:id/accept',
  authenticate,
  isBarista,
  validate(baristaValidator.idParam, 'params'),
  baristaController.acceptKOT
);

router.patch(
  '/kot/:id/complete',
  authenticate,
  isBarista,
  validate(baristaValidator.idParam, 'params'),
  baristaController.completeKOT
);

router.patch(
  '/orders/:id/complete',
  authenticate,
  isBarista,
  validate(baristaValidator.idParam, 'params'),
  baristaController.completeOrder
);

/* Cancel order — SOW §4 order status management */
router.patch(
  '/orders/:id/cancel',
  authenticate,
  isBarista,
  validate(baristaValidator.idParam, 'params'),
  validate(baristaValidator.cancelOrder),
  baristaController.cancelOrder
);

module.exports = router;