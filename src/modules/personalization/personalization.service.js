


'use strict';

const { pool }                                 = require('../../config/db');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');

const personalizationService = {


  async getProfile(customerId) {
    const [[user]] = await pool.execute(
      `SELECT
         u.uuid, u.name, u.mobile, u.created_at,
         COUNT(DISTINCT o.id)             AS total_orders,
         COALESCE(SUM(o.total_amount), 0) AS total_spent,
         MAX(o.created_at)                AS last_ordered_at
       FROM users u
       LEFT JOIN orders o
         ON o.customer_id = u.id
        AND o.status IN ('completed', 'ready')
       WHERE u.id = ?
       GROUP BY u.id`,
      [customerId]
    );

    return {
      id:              user.uuid,
      name:            user.name,
      mobile:          user.mobile,
      total_orders:    parseInt(user.total_orders,  10) || 0,
      total_spent:     parseFloat(user.total_spent)     || 0,
      last_ordered_at: user.last_ordered_at || null,
      member_since:    user.created_at,
    };
  },


  async getOrderHistory(customerId, query) {
    const { page, limit, offset } = parsePagination(query);
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const conditions = ['o.customer_id = ?'];
    const params     = [customerId];

    if (query.status) {
      conditions.push('o.status = ?');
      params.push(query.status);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders o ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT
         o.uuid          AS order_id,
         o.order_number,
         o.status,
         o.channel,
         o.total_amount,
         o.created_at,
         s.name          AS store_name,
         GROUP_CONCAT(oi.item_name ORDER BY oi.id SEPARATOR ', ') AS items_summary,
         COUNT(oi.id)    AS item_count
       FROM orders o
       JOIN stores s       ON s.id       = o.store_id
       JOIN order_items oi ON oi.order_id = o.id
       ${where}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      orders: rows.map((r) => ({
        id:            r.order_id,
        order_number:  r.order_number,
        status:        r.status,
        channel:       r.channel,
        store_name:    r.store_name,
        total_amount:  parseFloat(r.total_amount),
        item_count:    parseInt(r.item_count, 10),
        items_summary: r.items_summary,
        created_at:    r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

 
  async getTopOrders(customerId, limit = 5) {
    const lim = parseInt(limit, 10);

    const [rows] = await pool.query(
      `SELECT
         p.uuid           AS product_id,
         p.name           AS product_name,
         p.base_price,
         p.image_url,
         p.is_customizable,
         c.name           AS category_name,
         SUM(oi.quantity)     AS total_ordered,
         COUNT(DISTINCT o.id) AS order_count,
         MAX(o.created_at)    AS last_ordered_at
       FROM order_items oi
       JOIN orders     o  ON o.id  = oi.order_id
       JOIN products   p  ON p.id  = oi.product_id
       JOIN categories c  ON c.id  = p.category_id
       WHERE o.customer_id = ?
         AND o.status IN ('completed', 'ready')
         AND p.is_active = 1
       GROUP BY p.id
       ORDER BY total_ordered DESC, last_ordered_at DESC
       LIMIT ${lim}`,
      [customerId]
    );

    return rows.map((r) => ({
      product: {
        id:              r.product_id,
        name:            r.product_name,
        base_price:      parseFloat(r.base_price),
        image_url:       r.image_url || null,
        is_customizable: Boolean(r.is_customizable),
        category:        r.category_name,
      },
      total_ordered:   parseInt(r.total_ordered,   10),
      order_count:     parseInt(r.order_count,     10),
      last_ordered_at: r.last_ordered_at,
    }));
  },

 
  async getRecentDrinks(customerId, limit = 5) {
    const overfetch = parseInt(limit, 10) * 3;

    const [rows] = await pool.query(
      `SELECT
         p.uuid       AS product_id,
         p.name       AS product_name,
         p.base_price,
         p.image_url,
         p.is_customizable,
         oi.item_name,
         oi.unit_price,
         oi.customizations,
         o.uuid       AS order_id,
         o.created_at AS last_ordered_at
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p     ON p.id = oi.product_id
       WHERE o.customer_id = ?
         AND o.status IN ('completed', 'ready', 'in_progress')
         AND p.is_active = 1
       ORDER BY o.created_at DESC
       LIMIT ${overfetch}`,
      [customerId]
    );

    const seen    = new Set();
    const deduped = [];
    const maxItems = parseInt(limit, 10);

    for (const row of rows) {
      if (!seen.has(row.product_id)) {
        seen.add(row.product_id);
        deduped.push(row);
      }
      if (deduped.length >= maxItems) break;
    }

    return deduped.map((r) => ({
      product: {
        id:              r.product_id,
        name:            r.product_name,
        base_price:      parseFloat(r.base_price),
        image_url:       r.image_url || null,
        is_customizable: Boolean(r.is_customizable),
      },
      last_order_id:   r.order_id,
      last_ordered_at: r.last_ordered_at,
      last_price:      parseFloat(r.unit_price),
      customizations:  r.customizations
        ? (typeof r.customizations === 'string'
            ? JSON.parse(r.customizations)
            : r.customizations)
        : null,
    }));
  },


  async getFavouriteDrinks(customerId) {
    const [rows] = await pool.execute(
      `SELECT
         cd.uuid  AS drink_id,
         cd.name  AS drink_name,
         cd.total_price,
         cd.is_favourite,
         cd.order_count,
         cd.created_at,
         p.uuid   AS base_product_id,
         p.name   AS base_product_name
       FROM custom_drinks cd
       JOIN products p ON p.id = cd.base_product_id
       WHERE cd.customer_id = ?
         AND cd.is_active = 1
       ORDER BY cd.is_favourite DESC, cd.order_count DESC, cd.created_at DESC`,
      [customerId]
    );

    const drinks = await Promise.all(rows.map(async (r) => {
      const [ingredients] = await pool.execute(
        `SELECT
           i.id    AS ingredient_id,
           i.name  AS ingredient_name,
           i.unit,
           cdi.quantity,
           cdi.unit_price,
           cdi.total_price
         FROM custom_drink_ingredients cdi
         JOIN ingredients i ON i.id = cdi.ingredient_id
         JOIN custom_drinks cd ON cd.id = cdi.custom_drink_id
         WHERE cd.uuid = ?
         ORDER BY i.display_order ASC, i.name ASC`,
        [r.drink_id]
      );

      return {
        id:           r.drink_id,
        name:         r.drink_name,
        total_price:  parseFloat(r.total_price),
        is_favourite: Boolean(r.is_favourite),
        order_count:  parseInt(r.order_count, 10),
        base_product: { id: r.base_product_id, name: r.base_product_name },
        ingredients:  ingredients.map((i) => ({
          ingredient_id:   i.ingredient_id,
          ingredient_name: i.ingredient_name,
          unit:            i.unit || null,
          quantity:        parseFloat(i.quantity),
          unit_price:      parseFloat(i.unit_price),
          total_price:     parseFloat(i.total_price),
        })),
        created_at: r.created_at,
      };
    }));

    return drinks;
  },

  async getTasteProfile(customerId) {
    const [rows] = await pool.execute(
      `SELECT
         i.uuid           AS ingredient_id,
         i.name           AS ingredient_name,
         i.unit,
         SUM(oii.quantity)    AS total_quantity_consumed,
         COUNT(DISTINCT o.id) AS appearance_count
       FROM order_item_ingredients oii
       JOIN order_items oi ON oi.id  = oii.order_item_id
       JOIN orders o       ON o.id   = oi.order_id
       JOIN ingredients i  ON i.id   = oii.ingredient_id
       WHERE o.customer_id = ?
         AND o.status IN ('completed', 'ready')
       GROUP BY i.id
       ORDER BY appearance_count DESC, total_quantity_consumed DESC
       LIMIT 10`,
      [customerId]
    );

    return rows.map((r) => ({
      ingredient: {
        id:   r.ingredient_id,
        name: r.ingredient_name,
        unit: r.unit,
      },
      times_ordered:           parseInt(r.appearance_count,        10),
      total_quantity_consumed: parseFloat(r.total_quantity_consumed),
    }));
  },
};

module.exports = { personalizationService };