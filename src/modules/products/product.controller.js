'use strict';

const { categoryService, productService } = require('./product.service');
const Response = require('../../utils/response');


const categoryController = {
  async create(req, res, next) {
    try {
      const category = await categoryService.create(req.body);
      return Response.created(res, category, 'Category created successfully.');
    } catch (err) { return next(err); }
  },

  async getAll(req, res, next) {
    try {
      const onlyActive = !req.user || req.user.role === 'customer';
      const categories = await categoryService.getAll(onlyActive);
      return Response.ok(res, categories, 'Categories fetched successfully.');
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const category = await categoryService.getById(req.params.id);
      return Response.ok(res, category);
    } catch (err) { return next(err); }
  },

  async update(req, res, next) {
    try {
      const category = await categoryService.update(req.params.id, req.body);
      return Response.ok(res, category, 'Category updated successfully.');
    } catch (err) { return next(err); }
  },

  async delete(req, res, next) {
    try {
      await categoryService.delete(req.params.id);
      return Response.ok(res, null, 'Category deleted successfully.');
    } catch (err) { return next(err); }
  },
};

// ─── Product Controller ───────────────────────────────────────────────────────

const productController = {
  async create(req, res, next) {
    try {
      const product = await productService.create(req.body);
      return Response.created(res, product, 'Product created successfully.');
    } catch (err) { return next(err); }
  },

  async getList(req, res, next) {
    try {
      const result = await productService.getList(req.query);
      return Response.ok(res, result.products, 'Products fetched successfully.', result.meta);
    } catch (err) { return next(err); }
  },

  async getById(req, res, next) {
    try {
      const product = await productService.getById(req.params.id);
      return Response.ok(res, product);
    } catch (err) { return next(err); }
  },

  async update(req, res, next) {
    try {
      const product = await productService.update(req.params.id, req.body);
      return Response.ok(res, product, 'Product updated successfully.');
    } catch (err) { return next(err); }
  },

  async delete(req, res, next) {
    try {
      await productService.delete(req.params.id);
      return Response.ok(res, null, 'Product deleted successfully.');
    } catch (err) { return next(err); }
  },

  // ── Public menu endpoint — used by kiosk and D2C website ──────────────────
  async getMenu(req, res, next) {
    try {
      const menu = await productService.getMenu(req.query);
      return Response.ok(res, menu, 'Menu fetched successfully.');
    } catch (err) { return next(err); }
  },
};

module.exports = { categoryController, productController };