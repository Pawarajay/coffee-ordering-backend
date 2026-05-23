

'use strict';

const { reportsService } = require('./reports.service');
const Response           = require('../../utils/response');

const reportsController = {

  async getSummary(req, res, next) {
    try {
      const query = { ...req.query };
      if (['store_manager','barista'].includes(req.user.role)) query.store_id = req.user.storeId;
      const result = await reportsService.getSummary(query);
      return Response.ok(res, result, 'Revenue summary fetched.');
    } catch (err) { return next(err); }
  },

  async getTopProducts(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getTopProducts(query);
      return Response.ok(res, result.products, 'Top products fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getTopCustomers(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getTopCustomers(query);
      return Response.ok(res, result.customers, 'Top customers fetched.', result.meta);
    } catch (err) { return next(err); }
  },

  async getHourlyHeatmap(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getHourlyHeatmap(query);
      return Response.ok(res, result, 'Hourly heatmap fetched.');
    } catch (err) { return next(err); }
  },

  async getInventoryConsumption(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getInventoryConsumption(query);
      return Response.ok(res, result, 'Inventory consumption report fetched.');
    } catch (err) { return next(err); }
  },

  async getStoreComparison(req, res, next) {
    try {
      const result = await reportsService.getStoreComparison(req.query);
      return Response.ok(res, result, 'Store comparison fetched.');
    } catch (err) { return next(err); }
  },

  async getChannelBreakdown(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getChannelBreakdown(query);
      return Response.ok(res, result, 'Channel breakdown fetched.');
    } catch (err) { return next(err); }
  },

  async getCancellations(req, res, next) {
    try {
      const query = { ...req.query };
      if (req.user.role === 'store_manager') query.store_id = req.user.storeId;
      const result = await reportsService.getCancellations(query);
      return Response.ok(res, result, 'Cancellation report fetched.');
    } catch (err) { return next(err); }
  },

  async getCustomers(req, res, next) {
    try {
      const result = await reportsService.getCustomers(req.query);
      return Response.ok(res, result.customers, 'Customer data fetched.', result.meta);
    } catch (err) { return next(err); }
  },


  async getCustomDrinkStats(req, res, next) {
    try {
      const query = { ...req.query };
      const result = await reportsService.getCustomDrinkStats(query);
      return Response.ok(res, result, 'Custom drink stats fetched.');
    } catch (err) { return next(err); }
  },

 
  async exportCSV(req, res, next) {
    try {
      const { reportType } = req.params;
      const query          = { ...req.query };
      if (['store_manager','barista'].includes(req.user.role)) query.store_id = req.user.storeId;

      let rows = [];
      let columns = [];
      let filename = `${reportType}-report`;

      if (reportType === 'top-products') {
        const result = await reportsService.getTopProducts({ ...query, limit: 1000, page: 1 });
        rows    = result.products;
        columns = [
          { label: 'Rank',          key: 'rank' },
          { label: 'Product ID',    key: 'product.id' },
          { label: 'Product Name',  key: 'product.name' },
          { label: 'Category',      key: 'product.category' },
          { label: 'Total Quantity',key: 'total_quantity' },
          { label: 'Total Revenue', key: 'total_revenue' },
          { label: 'Order Count',   key: 'order_count' },
          { label: 'Avg Unit Price',key: 'avg_unit_price' },
        ];
        filename = 'top-products-report';

      } else if (reportType === 'top-customers') {
        const result = await reportsService.getTopCustomers({ ...query, limit: 1000, page: 1 });
        rows    = result.customers;
        columns = [
          { label: 'Rank',           key: 'rank' },
          { label: 'Customer Name',  key: 'customer.name' },
          { label: 'Mobile',         key: 'customer.mobile' },
          { label: 'Total Orders',   key: 'order_count' },
          { label: 'Total Spent (₹)',key: 'total_spent' },
          { label: 'Avg Order (₹)',  key: 'avg_order_value' },
          { label: 'First Order',    key: 'first_order_at' },
          { label: 'Last Order',     key: 'last_order_at' },
        ];
        filename = 'top-customers-report';

      } else if (reportType === 'customers') {
        const result = await reportsService.getCustomers({ ...query, limit: 5000, page: 1 });
        rows    = result.customers;
        columns = [
          { label: 'Name',          key: 'name' },
          { label: 'Mobile',        key: 'mobile' },
          { label: 'Email',         key: 'email' },
          { label: 'Total Orders',  key: 'total_orders' },
          { label: 'Total Spent (₹)',key: 'total_spent' },
          { label: 'Member Since',  key: 'member_since' },
          { label: 'Last Ordered',  key: 'last_ordered_at' },
          { label: 'Active',        key: 'is_active' },
        ];
        filename = 'customer-data';

      } else if (reportType === 'cancellations') {
        const result = await reportsService.getCancellations(query);
        rows    = result.top_reasons;
        columns = [
          { label: 'Reason',       key: 'reason' },
          { label: 'Count',        key: 'count' },
        ];
        filename = 'cancellation-reasons';

      } else if (reportType === 'custom-drinks') {
        const result = await reportsService.getCustomDrinkStats(query);
        rows    = result.top_drinks;
        columns = [
          { label: 'Rank',          key: 'rank' },
          { label: 'Drink Name',    key: 'name' },
          { label: 'Base Product',  key: 'base_product' },
          { label: 'Reorder Count', key: 'reorder_count' },
          { label: 'Price (₹)',     key: 'price' },
          { label: 'Created By',    key: 'created_by.name' },
          { label: 'Mobile',        key: 'created_by.mobile' },
        ];
        filename = 'custom-drinks-report';

      } else {
        return Response.badRequest(res, `Unknown reportType: "${reportType}". Supported: top-products, top-customers, customers, cancellations, custom-drinks`);
      }

      const csv = reportsService.buildCSV(rows, columns);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    } catch (err) { return next(err); }
  },
};

module.exports = { reportsController };