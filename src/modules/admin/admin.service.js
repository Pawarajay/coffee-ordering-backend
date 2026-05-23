'use strict';

const { pool } = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const logger = require('../../utils/logger');

const adminService = {


  async listUsers(query) {
    const page   = parseInt(query.page,  10) || 1;
    const limit  = parseInt(query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (query.role !== undefined) {
      conditions.push('u.role = ?');
      params.push(query.role);
    }
    if (query.is_active !== undefined) {
      conditions.push('u.is_active = ?');
      params.push(query.is_active ? 1 : 0);
    }
    if (query.store_id !== undefined) {
      conditions.push('u.store_id = ?');
      params.push(query.store_id);
    }
    if (query.search) {
      conditions.push('(u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ?)');
      params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT u.uuid, u.mobile, u.name, u.email, u.role,
              u.is_active, u.last_login_at, u.created_at,
              s.name AS store_name
         FROM users u
         LEFT JOIN stores s ON s.id = u.store_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return {
      users: rows.map(formatUser),
      meta: {
        total: countRows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countRows[0].total / limit),
      },
    };
  },

  /**
   * Get a single user by UUID.
   */
  async getUserById(uuid) {
    const [rows] = await pool.execute(
      `SELECT u.id, u.uuid, u.mobile, u.name, u.email, u.role,
              u.is_active, u.last_login_at, u.created_at, u.updated_at,
              s.id AS store_id, s.name AS store_name
         FROM users u
         LEFT JOIN stores s ON s.id = u.store_id
         WHERE u.uuid = ? LIMIT 1`,
      [uuid]
    );

    if (!rows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');
    return formatUser(rows[0]);
  },

  /**
   * Activate or deactivate a user account.
   * SOW: "Customer data management" — admin can deactivate accounts.
   */
  async updateUserStatus(uuid, isActive, reason, adminId) {
    const [rows] = await pool.execute(
      'SELECT id, uuid, role, is_active FROM users WHERE uuid = ? LIMIT 1',
      [uuid]
    );

    if (!rows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const user = rows[0];

    if (user.role === 'super_admin') {
      throw new AppError('Cannot modify super_admin account status.', 403, 'FORBIDDEN');
    }

    await pool.execute(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [isActive ? 1 : 0, user.id]
    );

    const action = isActive ? 'activated' : 'deactivated';
    logger.info(`[Admin] User ${uuid} ${action} by admin ${adminId}. Reason: ${reason || 'none'}`);

    return adminService.getUserById(uuid);
  },

  /**
   * Update a user's role and optionally assign to a store.
   */
  async updateUserRole(uuid, role, storeId, adminId) {
    const [rows] = await pool.execute(
      'SELECT id, uuid, role FROM users WHERE uuid = ? LIMIT 1',
      [uuid]
    );

    if (!rows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const user = rows[0];

    if (user.role === 'super_admin') {
      throw new AppError('Cannot modify super_admin role.', 403, 'FORBIDDEN');
    }

    // Validate store if assigning store-scoped role
    if (storeId && ['store_manager', 'barista'].includes(role)) {
      const [storeRows] = await pool.execute(
        'SELECT id FROM stores WHERE id = ? AND is_active = 1 LIMIT 1',
        [storeId]
      );
      if (!storeRows.length) throw new AppError('Store not found or inactive.', 404, 'STORE_NOT_FOUND');
    }

    await pool.execute(
      'UPDATE users SET role = ?, store_id = ? WHERE id = ?',
      [role, storeId || null, user.id]
    );

    logger.info(`[Admin] User ${uuid} role updated to "${role}" by admin ${adminId}`);
    return adminService.getUserById(uuid);
  },

  /**
   * Get order history for a specific customer.
   */
  async getUserOrders(uuid, query) {
    const page   = parseInt(query.page,  10) || 1;
    const limit  = parseInt(query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const [userRows] = await pool.execute(
      'SELECT id FROM users WHERE uuid = ? LIMIT 1', [uuid]
    );
    if (!userRows.length) throw new AppError('User not found.', 404, 'NOT_FOUND');
    const userId = userRows[0].id;

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?', [userId]
    );

    const [rows] = await pool.query(
      `SELECT o.uuid, o.order_number, o.status, o.channel,
              o.total_amount, o.created_at,
              s.name AS store_name
         FROM orders o
         JOIN stores s ON s.id = o.store_id
         WHERE o.customer_id = ?
         ORDER BY o.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
      [userId]
    );

    return {
      orders: rows.map((r) => ({
        id:           r.uuid,
        order_number: r.order_number,
        status:       r.status,
        channel:      r.channel,
        store_name:   r.store_name,
        total_amount: parseFloat(r.total_amount),
        created_at:   r.created_at,
      })),
      meta: {
        total: countRows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countRows[0].total / limit),
      },
    };
  },
};

function formatUser(row) {
  return {
    id:            row.uuid,
    mobile:        row.mobile,
    name:          row.name   || null,
    email:         row.email  || null,
    role:          row.role,
    is_active:     Boolean(row.is_active),
    store:         row.store_name ? { id: row.store_id, name: row.store_name } : null,
    last_login_at: row.last_login_at || null,
    created_at:    row.created_at,
  };
}

module.exports = { adminService };