
'use strict';

const { Router }          = require('express');
const { reportsController } = require('./reports.controller');
const { reportsValidator }  = require('./reports.validator');
const { validate }          = require('../../middlewares/validate.middleware');
const { authenticate }      = require('../../middlewares/auth.middleware');
const { isAdmin, isStoreManager } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/summary',
  authenticate,
  isStoreManager,
  validate(reportsValidator.summary, 'query'),
  reportsController.getSummary
);

router.get(
  '/top-products',
  authenticate,
  isStoreManager,
  validate(reportsValidator.topProducts, 'query'),
  reportsController.getTopProducts
);

router.get(
  '/top-customers',
  authenticate,
  isStoreManager,
  validate(reportsValidator.topCustomers, 'query'),
  reportsController.getTopCustomers
);

router.get(
  '/hourly-heatmap',
  authenticate,
  isStoreManager,
  validate(reportsValidator.hourlyHeatmap, 'query'),
  reportsController.getHourlyHeatmap
);

router.get(
  '/inventory-consumption',
  authenticate,
  isStoreManager,
  validate(reportsValidator.inventoryConsumption, 'query'),
  reportsController.getInventoryConsumption
);

router.get(
  '/channel-breakdown',
  authenticate,
  isStoreManager,
  validate(reportsValidator.channelBreakdown, 'query'),
  reportsController.getChannelBreakdown
);

router.get(
  '/cancellations',
  authenticate,
  isStoreManager,
  validate(reportsValidator.cancellations, 'query'),
  reportsController.getCancellations
);


router.get(
  '/store-comparison',
  authenticate,
  isAdmin,
  validate(reportsValidator.storeComparison, 'query'),
  reportsController.getStoreComparison
);


router.get(
  '/customers',
  authenticate,
  isAdmin,
  validate(reportsValidator.customers, 'query'),
  reportsController.getCustomers
);

router.get(
  '/custom-drinks',
  authenticate,
  isAdmin,
  validate(reportsValidator.customDrinkStats, 'query'),
  reportsController.getCustomDrinkStats
);


router.get(
  '/:reportType/export',
  authenticate,
  isAdmin,
  validate(reportsValidator.exportParam,  'params'),
  validate(reportsValidator.exportQuery,  'query'),
  reportsController.exportCSV
);

module.exports = router;