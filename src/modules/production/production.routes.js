
'use strict';

const { Router }               = require('express');
const { productionController }  = require('./production.controller');
const { productionValidator }   = require('./production.validator');
const { validate }              = require('../../middlewares/validate.middleware');
const { authenticate }          = require('../../middlewares/auth.middleware');
const { isAdmin, isStoreManager } = require('../../middlewares/role.middleware');

const router = Router();


router.get(
  '/central-inventory',
  authenticate,
  isStoreManager,
  productionController.getCentralInventory
);

router.post(
  '/raw-materials/stock-in',
  authenticate,
  isAdmin,
  validate(productionValidator.rawMaterialStockIn),
  productionController.rawMaterialStockIn
);

router.get(
  '/raw-materials',
  authenticate,
  isStoreManager,
  validate(productionValidator.rawMaterialQuery, 'query'),
  productionController.getRawMaterials
);

/* ── Production batches ─────────────────────────────────────────────────── */
router.post(
  '/batches',
  authenticate,
  isAdmin,
  validate(productionValidator.createBatch),
  productionController.createBatch
);

router.get(
  '/batches',
  authenticate,
  isStoreManager,
  validate(productionValidator.listBatches, 'query'),
  productionController.listBatches
);

router.get(
  '/batches/:id',
  authenticate,
  isStoreManager,
  validate(productionValidator.batchIdParam, 'params'),
  productionController.getBatchById
);

router.post(
  '/distribute',
  authenticate,
  isAdmin,
  validate(productionValidator.distribute),
  productionController.distribute
);

router.get(
  '/distribution',
  authenticate,
  isStoreManager,
  validate(productionValidator.distributionQuery, 'query'),
  productionController.getDistributionLog
);

module.exports = router;