

'use strict';

const { pool }                                 = require('../../config/db');
const { AppError }                             = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const logger                                   = require('../../utils/logger');

function getKotService() {
  return require('../kot/kot.service').kotService;
}

const storeService = {

  async create(data) {
    const [result] = await pool.execute(
      `INSERT INTO stores
         (uuid, name, address, city, state, pincode, phone, email,
          timezone, is_active, operating_hours, config)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.address  || null,
        data.city     || null,
        data.state    || null,
        data.pincode  || null,
        data.phone    || null,
        data.email    || null,
        data.timezone || 'Asia/Kolkata',
        data.is_active !== false ? 1 : 0,
        data.operating_hours ? JSON.stringify(data.operating_hours) : null,
        data.config          ? JSON.stringify(data.config)          : null,
      ]
    );
    return storeService.getById(result.insertId, true);
  },

  async getList(query) {
    const { page, limit, offset } = parsePagination(query);
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);
    const conditions = [];
    const params     = [];

    if (query.is_active !== undefined) {
      conditions.push('is_active = ?');
      params.push(query.is_active ? 1 : 0);
    }
    if (query.city) {
      conditions.push('city LIKE ?');
      params.push(`%${query.city}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM stores ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT id, uuid, name, address, city, state, pincode, phone, email,
              timezone, is_active, operating_hours, config,
              created_at, updated_at
         FROM stores ${where}
         ORDER BY name ASC
         LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      stores: rows.map(formatStore),
      meta:   buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'id' : 'uuid';
    const [rows] = await pool.execute(
      `SELECT id, uuid, name, address, city, state, pincode, phone, email,
              timezone, is_active, operating_hours, config,
              created_at, updated_at
         FROM stores WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!rows.length) throw new AppError('Store not found.', 404, 'NOT_FOUND');
    return formatStore(rows[0]);
  },

  async update(id, data) {
    const store = await storeService.getById(id, true);

    const fields = [];
    const values = [];

    const textFields = [
      'name', 'address', 'city', 'state',
      'pincode', 'phone', 'email', 'timezone',
    ];
    for (const field of textFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    if (!fields.length) throw new AppError('No fields to update.', 400, 'NO_FIELDS');

    values.push(store._pk);  
    await pool.execute(
      `UPDATE stores SET ${fields.join(', ')} WHERE id = ?`, values
    );

    logger.info(`[Store] Store ${id} updated.`);
    return storeService.getById(store._pk, true);
  },

  /* ── Update operating hours ─────────────────────────────────────────────── */
  async updateHours(id, operatingHours) {
    const store = await storeService.getById(id, true);
    await pool.execute(
      'UPDATE stores SET operating_hours = ? WHERE id = ?',
      [JSON.stringify(operatingHours), store._pk]
    );
    logger.info(`[Store] Operating hours updated for store ${id}.`);
    return storeService.getById(store._pk, true);
  },

  /* ── Update config (deep merge) ─────────────────────────────────────────── */
  async updateConfig(id, newConfig) {
    const store        = await storeService.getById(id, true);
    const mergedConfig = { ...(store.config || {}), ...newConfig };
    await pool.execute(
      'UPDATE stores SET config = ? WHERE id = ?',
      [JSON.stringify(mergedConfig), store._pk]
    );
    logger.info(`[Store] Config updated for store ${id}.`);
    return storeService.getById(store._pk, true);
  },

  /* ── Assign staff ───────────────────────────────────────────────────────── */
  async assignStaff(storeId, userId, role) {
    const store = await storeService.getById(storeId, true);

    const [userRows] = await pool.execute(
      'SELECT id, name, role FROM users WHERE id = ? LIMIT 1', [userId]
    );
    if (!userRows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');

    const user = userRows[0];
    if (['customer', 'super_admin'].includes(user.role)) {
      throw new AppError(
        `Cannot assign role "${role}" to a ${user.role} account.`,
        400, 'INVALID_ROLE_ASSIGNMENT'
      );
    }

    await pool.execute(
      'UPDATE users SET store_id = ?, role = ? WHERE id = ?',
      [store._pk, role, userId]
    );

    logger.info(`[Store] User ${userId} assigned to store ${storeId} as ${role}.`);
    return { user_id: userId, store_id: storeId, role, name: user.name };
  },


  async removeStaff(storeId, userId) {
    const store = await storeService.getById(storeId, true);

    const [userRows] = await pool.execute(
      'SELECT id, name, role, store_id FROM users WHERE id = ? LIMIT 1', [userId]
    );
    if (!userRows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');

    const user = userRows[0];
    if (user.store_id !== store._pk) {
      throw new AppError(
        'This user is not assigned to this store.', 400, 'NOT_ASSIGNED'
      );
    }

    await pool.execute(
      'UPDATE users SET store_id = NULL WHERE id = ?', [userId]
    );

    logger.info(`[Store] User ${userId} (${user.name}) removed from store ${storeId}.`);
    return { user_id: userId, store_id: storeId, unassigned: true, name: user.name };
  },

  async getStaff(storeId) {
    const store = await storeService.getById(storeId, true);
    const [rows] = await pool.execute(
      `SELECT id, name, mobile, email, role, last_login_at, is_active
         FROM users
         WHERE store_id = ?
           AND role IN ('store_manager', 'barista')
         ORDER BY role ASC, name ASC`,
      [store._pk]
    );
    return rows.map((r) => ({
      id:            r.id,
      name:          r.name,
      mobile:        r.mobile,
      email:         r.email,
      role:          r.role,
      is_active:     Boolean(r.is_active),
      last_login_at: r.last_login_at,
    }));
  },

 
  async getMenuOverrides(storeId) {
    const store = await storeService.getById(storeId, true);
    const [rows] = await pool.execute(
      `SELECT
         spo.product_id,
         p.uuid  AS product_uuid,
         p.name  AS product_name,
         spo.is_available,
         spo.override_price,
         spo.updated_at
       FROM store_product_overrides spo
       JOIN products p ON p.id = spo.product_id
       WHERE spo.store_id = ?
       ORDER BY p.name ASC`,
      [store._pk]
    );
    return rows.map((r) => ({
      product_id:     r.product_uuid,
      product_name:   r.product_name,
      is_available:   Boolean(r.is_available),
      override_price: r.override_price ? parseFloat(r.override_price) : null,
      updated_at:     r.updated_at,
    }));
  },

  async setMenuOverride(storeId, productUuid, data) {
    const store = await storeService.getById(storeId, true);

    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length)
      throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');

    const productId = productRows[0].id;

    await pool.execute(
      `INSERT INTO store_product_overrides
         (store_id, product_id, is_available, override_price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_available   = VALUES(is_available),
         override_price = VALUES(override_price),
         updated_at     = NOW()`,
      [
        store._pk,
        productId,
        data.is_available !== undefined ? (data.is_available ? 1 : 0) : 1,
        data.override_price || null,
      ]
    );

    logger.info(`[Store] Menu override set for product ${productUuid} at store ${storeId}.`);
    return storeService.getMenuOverrides(storeId);
  },

  async deleteMenuOverride(storeId, productUuid) {
    const store = await storeService.getById(storeId, true);

    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length)
      throw new AppError('Product not found.', 404, 'PRODUCT_NOT_FOUND');

    await pool.execute(
      'DELETE FROM store_product_overrides WHERE store_id = ? AND product_id = ?',
      [store._pk, productRows[0].id]
    );

    logger.info(`[Store] Menu override removed for product ${productUuid} at store ${storeId}.`);
    return { removed: true, product_id: productUuid, store_id: storeId };
  },

 
  async getDashboardSummary(storeId) {
    const storeIdInt = parseInt(storeId, 10);
    const store      = await storeService.getById(storeIdInt, true);

    const [orderCounts] = await pool.execute(
      `SELECT
         SUM(status = 'pending')     AS pending,
         SUM(status = 'confirmed')   AS confirmed,
         SUM(status = 'in_progress') AS in_progress,
         SUM(status = 'ready')       AS ready,
         SUM(status = 'completed' AND DATE(completed_at) = CURDATE()) AS completed_today,
         COALESCE(SUM(
           CASE WHEN DATE(created_at) = CURDATE() THEN total_amount END
         ), 0) AS revenue_today
       FROM orders WHERE store_id = ?`,
      [storeIdInt]
    );

    const [alertCounts] = await pool.execute(
      `SELECT
         SUM(alert_type = 'out_of_stock') AS out_of_stock,
         SUM(alert_type = 'critical')     AS critical,
         SUM(alert_type = 'low')          AS low
       FROM stock_alerts WHERE store_id = ? AND is_resolved = 0`,
      [storeIdInt]
    );

    const [staffCount] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM users
         WHERE store_id = ? AND is_active = 1
           AND role IN ('barista', 'store_manager')`,
      [storeIdInt]
    );

    /* FIX 2: KOT queue counts for barista badge */
    const kotCounts = await getKotService().getPendingCount(storeIdInt);

    const oc = orderCounts[0];
    const ac = alertCounts[0];

    return {
      store,
      live_orders: {
        pending:         parseInt(oc.pending,         10) || 0,
        confirmed:       parseInt(oc.confirmed,       10) || 0,
        in_progress:     parseInt(oc.in_progress,     10) || 0,
        ready:           parseInt(oc.ready,           10) || 0,
        completed_today: parseInt(oc.completed_today, 10) || 0,
        revenue_today:   parseFloat(oc.revenue_today)     || 0,
      },
      /* KOT queue counts — for barista badge in dashboard header */
      kot_queue: {
        open:        kotCounts.open,
        in_progress: kotCounts.in_progress,
      },
      stock_alerts: {
        out_of_stock: parseInt(ac.out_of_stock, 10) || 0,
        critical:     parseInt(ac.critical,     10) || 0,
        low:          parseInt(ac.low,          10) || 0,
      },
      active_staff: parseInt(staffCount[0].cnt, 10) || 0,
    };
  },

  /* ── Deactivate ─────────────────────────────────────────────────────────── */
  async deactivate(id) {
    const store = await storeService.getById(id, true);
    await pool.execute('UPDATE stores SET is_active = 0 WHERE id = ?', [store._pk]);
    logger.info(`[Store] Store ${id} deactivated.`);
    return { deactivated: true, store_id: id };
  },
};

/* ─── Formatter ──────────────────────────────────────────────────────────── */

function formatStore(row) {
  return {
    /* _pk is internal only — used within the service for subsequent queries */
    _pk:       row.id,
    id:        row.uuid,       /* public-facing ID is UUID */
    name:      row.name,
    address:   row.address,
    city:      row.city,
    state:     row.state,
    pincode:   row.pincode,
    phone:     row.phone,
    email:     row.email,
    timezone:  row.timezone,
    is_active: Boolean(row.is_active),
    operating_hours: row.operating_hours
      ? (typeof row.operating_hours === 'string'
          ? JSON.parse(row.operating_hours)
          : row.operating_hours)
      : null,
    config: row.config
      ? (typeof row.config === 'string'
          ? JSON.parse(row.config)
          : row.config)
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = { storeService };