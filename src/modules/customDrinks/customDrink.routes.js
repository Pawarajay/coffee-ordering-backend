
'use strict';

const { Router } = require('express');
const { customDrinkController } = require('./customDrink.controller');
const { customDrinkValidator } = require('./customDrink.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = Router();


router.post(
  '/',
  authenticate,
  validate(customDrinkValidator.create),
  customDrinkController.create
);

router.get(
  '/',
  authenticate,
  validate(customDrinkValidator.listQuery, 'query'),
  customDrinkController.list
);

router.get(
  '/:id',
  authenticate,
  validate(customDrinkValidator.idParam, 'params'),
  customDrinkController.getById
);

router.patch(
  '/:id',
  authenticate,
  validate(customDrinkValidator.idParam, 'params'),
  validate(customDrinkValidator.update),
  customDrinkController.update
);

router.delete(
  '/:id',
  authenticate,
  validate(customDrinkValidator.idParam, 'params'),
  customDrinkController.remove
);

router.post(
  '/:id/reorder',
  authenticate,
  validate(customDrinkValidator.idParam, 'params'),
  validate(customDrinkValidator.reorder),
  customDrinkController.reorder
);

// NEW: WhatsApp share endpoint (SOW Section 9)
router.post(
  '/:id/share',
  authenticate,
  validate(customDrinkValidator.idParam, 'params'),
  validate(customDrinkValidator.share),
  customDrinkController.share
);

module.exports = router;