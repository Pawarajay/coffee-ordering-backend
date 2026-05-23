
'use strict';

const { Router }                   = require('express');
const { personalizationController } = require('./personalization.controller');
const { personalizationValidator }  = require('./personalization.validator');
const { validate }                 = require('../../middlewares/validate.middleware');
const { authenticate }             = require('../../middlewares/auth.middleware');

const router = Router();


router.get(
  '/profile',
  authenticate,
  personalizationController.getProfile
);

router.get(
  '/order-history',
  authenticate,
  validate(personalizationValidator.orderHistoryQuery, 'query'),
  personalizationController.getOrderHistory
);

router.get(
  '/top-orders',
  authenticate,
  validate(personalizationValidator.topOrdersQuery, 'query'),
  personalizationController.getTopOrders
);

router.get(
  '/recent-drinks',
  authenticate,
  validate(personalizationValidator.recentDrinksQuery, 'query'),
  personalizationController.getRecentDrinks
);

router.get(
  '/favourite-drinks',
  authenticate,
  personalizationController.getFavouriteDrinks
);

router.get(
  '/taste-profile',
  authenticate,
  personalizationController.getTasteProfile
);

router.post(
  '/reorder/:orderId',
  authenticate,
  validate(personalizationValidator.reorderFromOrderParam, 'params'),
  validate(personalizationValidator.reorderBody),
  personalizationController.reorderFromOrder
);

router.post(
  '/reorder-drink/:drinkId',
  authenticate,
  validate(personalizationValidator.reorderFromDrinkParam, 'params'),
  validate(personalizationValidator.reorderBody),
  personalizationController.reorderFromDrink
);

module.exports = router;