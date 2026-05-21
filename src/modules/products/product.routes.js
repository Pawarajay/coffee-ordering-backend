'use strict';

const { Router } = require('express');
const { categoryController, productController } = require('./product.controller');
const { categoryValidator, productValidator } = require('./product.validator');
const { validate } = require('../../middlewares/validate.middleware');
const { authenticate, optionalAuthenticate } = require('../../middlewares/auth.middleware');
const { isAdmin } = require('../../middlewares/role.middleware');

const router = Router();

router.get(
  '/menu',
  validate(productValidator.menuQuery, 'query'),
  productController.getMenu
);

router.get(
  '/categories',
  optionalAuthenticate,
  categoryController.getAll
);

router.get(
  '/categories/:id',
  validate(categoryValidator.idParam, 'params'),
  categoryController.getById
);

router.post(
  '/categories',
  authenticate,
  isAdmin,
  validate(categoryValidator.create),
  categoryController.create
);

router.patch(
  '/categories/:id',
  authenticate,
  isAdmin,
  validate(categoryValidator.idParam, 'params'),
  validate(categoryValidator.update),
  categoryController.update
);

router.delete(
  '/categories/:id',
  authenticate,
  isAdmin,
  validate(categoryValidator.idParam, 'params'),
  categoryController.delete
);

// ── Products ──────────────────────────────────────────────────────────────────
router.get(
  '/products',
  validate(productValidator.listQuery, 'query'),
  productController.getList
);

router.get(
  '/products/:id',
  validate(productValidator.idParam, 'params'),
  productController.getById
);

router.post(
  '/products',
  authenticate,
  isAdmin,
  validate(productValidator.create),
  productController.create
);

router.patch(
  '/products/:id',
  authenticate,
  isAdmin,
  validate(productValidator.idParam, 'params'),
  validate(productValidator.update),
  productController.update
);

router.delete(
  '/products/:id',
  authenticate,
  isAdmin,
  validate(productValidator.idParam, 'params'),
  productController.delete
);

module.exports = router;