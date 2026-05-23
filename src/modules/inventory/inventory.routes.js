
'use strict';

const { Router }             = require('express');
const { inventoryController } = require('./inventory.controller');
const { inventoryValidator }  = require('./inventory.validator');
const { validate }            = require('../../middlewares/validate.middleware');
const { authenticate }        = require('../../middlewares/auth.middleware');
const { isStoreManager, isStaff, isAdmin } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/alerts/summary',
  authenticate,
  isStaff,
  inventoryController.getAlertSummary
);

router.get(
  '/',
  authenticate,
  isStaff,
  validate(inventoryValidator.listQuery, 'query'),
  inventoryController.getStockLevels
);

router.get(
  '/transactions',
  authenticate,
  isStaff,
  validate(inventoryValidator.transactionQuery, 'query'),
  inventoryController.getTransactions
);

router.post(
  '/stock-in',
  authenticate,
  isStoreManager,
  validate(inventoryValidator.stockIn),
  inventoryController.stockIn
);

router.post(
  '/adjust',
  authenticate,
  isStoreManager,
  validate(inventoryValidator.adjust),
  inventoryController.adjust
);

router.post(
  '/wastage',
  authenticate,
  isStoreManager,
  validate(inventoryValidator.wastage),
  inventoryController.recordWastage
);

router.get(
  '/alerts',
  authenticate,
  isStaff,
  validate(inventoryValidator.alertQuery, 'query'),
  inventoryController.getAlerts
);

router.patch(
  '/alerts/:id/resolve',
  authenticate,
  isStoreManager,
  validate(inventoryValidator.alertIdParam, 'params'),
  inventoryController.resolveAlert
);


router.post(
  '/central/raw-material-in',
  authenticate,
  isAdmin,
  validate(inventoryValidator.centralRawMaterialIn),
  inventoryController.centralRawMaterialIn
);


router.post(
  '/central/production-batch',
  authenticate,
  isAdmin,
  validate(inventoryValidator.createProductionBatch),
  inventoryController.createProductionBatch
);


router.get(
  '/central/production-batches',
  authenticate,
  isAdmin,
  validate(inventoryValidator.productionBatchQuery, 'query'),
  inventoryController.getProductionBatches
);


router.post(
  '/central/distribute',
  authenticate,
  isAdmin,
  validate(inventoryValidator.distributeToChannel),
  inventoryController.distributeToChannel
);


router.get(
  '/central/distribution-orders',
  authenticate,
  isAdmin,
  validate(inventoryValidator.distributionOrderQuery, 'query'),
  inventoryController.getDistributionOrders
);

module.exports = router;