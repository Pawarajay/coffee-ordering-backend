

'use strict';

const { Router } = require('express');
const {
  ingredientController,
  ingredientGroupController,
  ingredientMappingController,
} = require('./ingredient.controller');
const {
  ingredientValidator,
  ingredientGroupValidator,
  ingredientMappingValidator,
} = require('./ingredient.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate } = require('../../middlewares/auth.middleware');
const { isAdmin, isStaff } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/ingredients',
  authenticate,
  isStaff,
  validate(ingredientValidator.listQuery, 'query'),
  ingredientController.getList
);

router.get(
  '/ingredients/:id',
  authenticate,
  isStaff,
  validate(ingredientValidator.idParam, 'params'),
  ingredientController.getById
);

router.post(
  '/ingredients',
  authenticate,
  isAdmin,
  validate(ingredientValidator.create),
  ingredientController.create
);

router.patch(
  '/ingredients/:id',
  authenticate,
  isAdmin,
  validate(ingredientValidator.idParam, 'params'),
  validate(ingredientValidator.update),
  ingredientController.update
);

router.delete(
  '/ingredients/:id',
  authenticate,
  isAdmin,
  validate(ingredientValidator.idParam, 'params'),
  ingredientController.delete
);

router.get(
  '/ingredient-groups',
  authenticate,
  isStaff,
  ingredientGroupController.getAll
);

router.get(
  '/ingredient-groups/:id',
  authenticate,
  isStaff,
  validate(ingredientGroupValidator.idParam, 'params'),
  ingredientGroupController.getById
);

router.post(
  '/ingredient-groups',
  authenticate,
  isAdmin,
  validate(ingredientGroupValidator.create),
  ingredientGroupController.create
);

router.patch(
  '/ingredient-groups/:id',
  authenticate,
  isAdmin,
  validate(ingredientGroupValidator.idParam, 'params'),
  validate(ingredientGroupValidator.update),
  ingredientGroupController.update
);

router.delete(
  '/ingredient-groups/:id',
  authenticate,
  isAdmin,
  validate(ingredientGroupValidator.idParam, 'params'),
  ingredientGroupController.delete
);

router.get(
  '/products/:productId/ingredients',
  validate(ingredientMappingValidator.productIdParam, 'params'),
  ingredientMappingController.getByProduct
);

router.post(
  '/products/:productId/ingredients/bulk',
  authenticate,
  isAdmin,
  validate(ingredientMappingValidator.productIdParam, 'params'),
  validate(ingredientMappingValidator.bulk),
  ingredientMappingController.bulkSet
);

router.post(
  '/products/:productId/ingredients',
  authenticate,
  isAdmin,
  validate(ingredientMappingValidator.productIdParam, 'params'),
  validate(ingredientMappingValidator.create),
  ingredientMappingController.addMapping
);

router.patch(
  '/products/:productId/ingredients/:ingredientId',
  authenticate,
  isAdmin,
  validate(ingredientMappingValidator.mappingParam, 'params'),
  validate(ingredientMappingValidator.update),
  ingredientMappingController.updateMapping
);

router.delete(
  '/products/:productId/ingredients/:ingredientId',
  authenticate,
  isAdmin,
  validate(ingredientMappingValidator.mappingParam, 'params'),
  ingredientMappingController.removeMapping
);

router.post(
  '/products/:productId/price-preview',
  validate(ingredientMappingValidator.productIdParam, 'params'),
  validate(ingredientMappingValidator.pricePreview),
  ingredientMappingController.previewPrice
);

module.exports = router;