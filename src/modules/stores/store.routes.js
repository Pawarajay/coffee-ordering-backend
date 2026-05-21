
'use strict';

const { Router }       = require('express');
const { storeController } = require('./store.controller');
const { storeValidator }  = require('./store.validator');
const { validate }        = require('../../middlewares/validate.middleware');
const { authenticate }    = require('../../middlewares/auth.middleware');
const { isAdmin, isStoreManager, isStaff } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/',
  authenticate,
  isStaff,
  validate(storeValidator.listQuery, 'query'),
  storeController.getList
);

router.post(
  '/',
  authenticate,
  isAdmin,
  validate(storeValidator.create),
  storeController.create
);

/* ── /:id/dashboard ──────────────────────────────────────────────────────── */
router.get(
  '/:id/dashboard',
  authenticate,
  isStoreManager,
  validate(storeValidator.idParam, 'params'),
  storeController.getDashboardSummary
);

/* ── /:id/staff ──────────────────────────────────────────────────────────── */
router.get(
  '/:id/staff',
  authenticate,
  isStoreManager,
  validate(storeValidator.idParam, 'params'),
  storeController.getStaff
);

router.post(
  '/:id/staff',
  authenticate,
  isAdmin,
  validate(storeValidator.idParam, 'params'),
  validate(storeValidator.assignStaff),
  storeController.assignStaff
);

/* DELETE /stores/:id/staff/:userId — remove staff from store */
router.delete(
  '/:id/staff/:userId',
  authenticate,
  isAdmin,
  validate(storeValidator.staffParam, 'params'),
  storeController.removeStaff
);

/* ── /:id/menu-overrides — SOW §7 menu overrides ─────────────────────────── */
router.get(
  '/:id/menu-overrides',
  authenticate,
  isStoreManager,
  validate(storeValidator.idParam, 'params'),
  storeController.getMenuOverrides
);

router.put(
  '/:id/menu-overrides/:productId',
  authenticate,
  isAdmin,
  validate(storeValidator.menuOverrideParam, 'params'),
  validate(storeValidator.setMenuOverride),
  storeController.setMenuOverride
);

router.delete(
  '/:id/menu-overrides/:productId',
  authenticate,
  isAdmin,
  validate(storeValidator.menuOverrideParam, 'params'),
  storeController.deleteMenuOverride
);

/* ── /:id core routes ────────────────────────────────────────────────────── */
router.get(
  '/:id',
  authenticate,
  isStaff,
  validate(storeValidator.idParam, 'params'),
  storeController.getById
);

router.patch(
  '/:id',
  authenticate,
  isAdmin,
  validate(storeValidator.idParam, 'params'),
  validate(storeValidator.update),
  storeController.update
);

router.patch(
  '/:id/hours',
  authenticate,
  isAdmin,
  validate(storeValidator.idParam, 'params'),
  validate(storeValidator.updateHours),
  storeController.updateHours
);

router.patch(
  '/:id/config',
  authenticate,
  isAdmin,
  validate(storeValidator.idParam, 'params'),
  validate(storeValidator.updateConfig),
  storeController.updateConfig
);

router.delete(
  '/:id',
  authenticate,
  isAdmin,
  validate(storeValidator.idParam, 'params'),
  storeController.deactivate
);

module.exports = router;