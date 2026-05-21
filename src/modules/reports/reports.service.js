
'use strict';

const { pool }                                 = require('../../config/db');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');

function buildOrderWhere(q, tableAlias = 'o', allStatuses = false, revenueOnly = false) {
  const conditions = [];
  const params     = [];

  if (!allStatuses) {
    conditions.push(revenueOnly
      ? `${tableAlias}.status = 'completed'`
      : `${tableAlias}.status IN ('completed', 'ready', 'in_progress')`
    );
  }
  if (q.store_id)  { conditions.push(`${tableAlias}.store_id = ?`);        params.push(Number(q.store_id)); }
  if (q.date_from) { conditions.push(`DATE(${tableAlias}.created_at) >= ?`); params.push(formatDate(q.date_from)); }
  if (q.date_to)   { conditions.push(`DATE(${tableAlias}.created_at) <= ?`); params.push(formatDate(q.date_to)); }

  return {
    where:  conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function granularityFormat(granularity) {
  return { day: '%Y-%m-%d', week: '%Y-%u', month: '%Y-%m' }[granularity] || '%Y-%m-%d';
}


const reportsService = {

  async getSummary(query) {
    const { where: revWhere, params: revParams } = buildOrderWhere(query, 'o', false, true);
    const { where, params }                      = buildOrderWhere(query);
    const fmt = granularityFormat(query.granularity);

    const [totalRows] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(total_amount), 0) AS total_revenue,
              COALESCE(AVG(total_amount), 0) AS avg_order_value,
              COALESCE(MAX(total_amount), 0) AS max_order_value,
              COALESCE(MIN(total_amount), 0) AS min_order_value,
              COUNT(DISTINCT customer_id)    AS unique_customers
         FROM orders o ${revWhere}`, revParams
    );

    const [trendRows] = await pool.query(
      `SELECT DATE_FORMAT(o.created_at, '${fmt}') AS period,
              COUNT(*)                             AS order_count,
              COALESCE(SUM(o.total_amount), 0)     AS revenue,
              COALESCE(AVG(o.total_amount), 0)     AS avg_order_value,
              COUNT(DISTINCT o.customer_id)        AS unique_customers
         FROM orders o ${revWhere}
         GROUP BY period ORDER BY period ASC`, revParams
    );

    const [activeRows] = await pool.query(
      `SELECT SUM(status = 'in_progress') AS in_progress,
              SUM(status = 'ready')       AS ready
         FROM orders o ${where}`, params
    );

    const t = totalRows[0];
    const a = activeRows[0];
    return {
      period: { from: formatDate(query.date_from), to: formatDate(query.date_to), granularity: query.granularity, store_id: query.store_id || null },
      totals: {
        order_count:        parseInt(t.total_orders,     10) || 0,
        revenue:            parseFloat(t.total_revenue).toFixed(2),
        avg_order_value:    parseFloat(t.avg_order_value).toFixed(2),
        max_order_value:    parseFloat(t.max_order_value).toFixed(2),
        min_order_value:    parseFloat(t.min_order_value).toFixed(2),
        unique_customers:   parseInt(t.unique_customers, 10) || 0,
        active_in_progress: parseInt(a.in_progress,      10) || 0,
        active_ready:       parseInt(a.ready,             10) || 0,
      },
      trend: trendRows.map((r) => ({
        period:           r.period,
        order_count:      parseInt(r.order_count,      10),
        revenue:          parseFloat(r.revenue).toFixed(2),
        avg_order_value:  parseFloat(r.avg_order_value).toFixed(2),
        unique_customers: parseInt(r.unique_customers, 10),
      })),
    };
  },


  async getTopProducts(query) {
    const { where, params } = buildOrderWhere(query, 'o', false, true);
    const orderBy           = query.by === 'quantity' ? 'total_quantity DESC' : 'total_revenue DESC';
    const { page, limit, offset } = parsePagination(query);

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT p.id) AS total
         FROM order_items oi
         JOIN orders o   ON o.id = oi.order_id
         JOIN products p ON p.id = oi.product_id
         ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT p.uuid AS product_id, p.name AS product_name,
              p.base_price, p.image_url, c.name AS category_name,
              SUM(oi.quantity)     AS total_quantity,
              SUM(oi.total_price)  AS total_revenue,
              COUNT(DISTINCT o.id) AS order_count,
              AVG(oi.unit_price)   AS avg_unit_price,
              MAX(o.created_at)    AS last_ordered_at
         FROM order_items oi
         JOIN orders     o ON o.id = oi.order_id
         JOIN products   p ON p.id = oi.product_id
         JOIN categories c ON c.id = p.category_id
         ${where}
         GROUP BY p.id ORDER BY ${orderBy}
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`, params
    );

    return {
      products: rows.map((r, idx) => ({
        rank: parseInt(offset, 10) + idx + 1,
        product: { id: r.product_id, name: r.product_name, base_price: parseFloat(r.base_price), image_url: r.image_url || null, category: r.category_name },
        total_quantity: parseInt(r.total_quantity, 10), total_revenue: parseFloat(r.total_revenue).toFixed(2),
        order_count: parseInt(r.order_count, 10), avg_unit_price: parseFloat(r.avg_unit_price).toFixed(2),
        last_ordered_at: r.last_ordered_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  
  async getTopCustomers(query) {
    const { where, params } = buildOrderWhere(query, 'o', false, true);
    const { page, limit, offset } = parsePagination(query);

    const [countRows] = await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS total FROM orders o JOIN users u ON u.id = o.customer_id ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT u.uuid AS customer_id, u.name AS customer_name, u.mobile, u.email,
              COUNT(o.id) AS order_count, SUM(o.total_amount) AS total_spent,
              AVG(o.total_amount) AS avg_order_value,
              MAX(o.created_at)   AS last_order_at, MIN(o.created_at) AS first_order_at
         FROM orders o JOIN users u ON u.id = o.customer_id
         ${where}
         GROUP BY u.id ORDER BY total_spent DESC
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`, params
    );

    return {
      customers: rows.map((r, idx) => ({
        rank: parseInt(offset, 10) + idx + 1,
        customer: { id: r.customer_id, name: r.customer_name || 'Guest', mobile: r.mobile, email: r.email },
        order_count: parseInt(r.order_count, 10), total_spent: parseFloat(r.total_spent).toFixed(2),
        avg_order_value: parseFloat(r.avg_order_value).toFixed(2),
        last_order_at: r.last_order_at, first_order_at: r.first_order_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getHourlyHeatmap(query) {
    const { where, params } = buildOrderWhere(query);
    const [hourRows] = await pool.query(
      `SELECT HOUR(o.created_at) AS hour_of_day, COUNT(*) AS order_count, SUM(o.total_amount) AS revenue
         FROM orders o ${where} GROUP BY hour_of_day ORDER BY hour_of_day ASC`, params
    );
    const [gridRows] = await pool.query(
      `SELECT DAYOFWEEK(o.created_at) AS day_of_week, HOUR(o.created_at) AS hour_of_day, COUNT(*) AS order_count
         FROM orders o ${where} GROUP BY day_of_week, hour_of_day ORDER BY day_of_week, hour_of_day`, params
    );
    const hourMap    = new Map(hourRows.map((r) => [r.hour_of_day, r]));
    const hourlyData = Array.from({ length: 24 }, (_, h) => {
      const row = hourMap.get(h);
      return { hour: h, label: `${String(h).padStart(2,'0')}:00`, order_count: row ? parseInt(row.order_count,10) : 0, revenue: row ? parseFloat(row.revenue).toFixed(2) : '0.00' };
    });
    const peakHour = hourlyData.reduce((best, h) => h.order_count > best.order_count ? h : best, { hour: 0, order_count: 0 });
    const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return {
      period: { from: formatDate(query.date_from), to: formatDate(query.date_to), store_id: query.store_id || null },
      hourly: hourlyData, peak_hour: peakHour,
      grid: gridRows.map((r) => ({ day: dayLabels[r.day_of_week - 1], day_number: r.day_of_week, hour: r.hour_of_day, order_count: parseInt(r.order_count,10) })),
    };
  },

  async getInventoryConsumption(query) {
    const conditions = ["it.txn_type IN ('stock_out', 'wastage')"];
    const params     = [];
    if (query.store_id)  { conditions.push('it.store_id = ?');          params.push(Number(query.store_id)); }
    if (query.date_from) { conditions.push('DATE(it.created_at) >= ?'); params.push(formatDate(query.date_from)); }
    if (query.date_to)   { conditions.push('DATE(it.created_at) <= ?'); params.push(formatDate(query.date_to)); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [rows] = await pool.query(
      `SELECT i.uuid AS ingredient_id, i.name AS ingredient_name, i.unit,
              ABS(SUM(it.quantity)) AS total_consumed,
              ABS(SUM(CASE WHEN it.txn_type='stock_out' THEN it.quantity ELSE 0 END)) AS order_qty,
              ABS(SUM(CASE WHEN it.txn_type='wastage'   THEN it.quantity ELSE 0 END)) AS wastage_qty,
              COUNT(DISTINCT it.reference_id) AS involved_orders
         FROM inventory_transactions it JOIN ingredients i ON i.id = it.ingredient_id
         ${where} GROUP BY i.id ORDER BY total_consumed DESC
         LIMIT ${parseInt(query.limit||20,10)}`, params
    );
    return rows.map((r, idx) => ({
      rank: idx+1, ingredient: { id: r.ingredient_id, name: r.ingredient_name, unit: r.unit },
      consumed: { total: parseFloat(r.total_consumed), from_orders: parseFloat(r.order_qty), from_wastage: parseFloat(r.wastage_qty), order_count: parseInt(r.involved_orders,10) },
    }));
  },


  async getStoreComparison(query) {
    const params = [formatDate(query.date_from), formatDate(query.date_to)];
    const [rows] = await pool.query(
      `SELECT s.uuid AS store_uuid, s.name AS store_name, s.city,
              COUNT(o.id) AS order_count, COALESCE(SUM(o.total_amount),0) AS revenue,
              COALESCE(AVG(o.total_amount),0) AS avg_order_value,
              COUNT(DISTINCT o.customer_id) AS unique_customers,
              SUM(o.status='cancelled') AS cancelled_orders, SUM(o.status='completed') AS completed_orders
         FROM stores s
         LEFT JOIN orders o ON o.store_id = s.id AND o.status NOT IN ('cancelled')
           AND DATE(o.created_at) BETWEEN ? AND ?
         WHERE s.is_active = 1 GROUP BY s.id ORDER BY revenue DESC`, params
    );
    const grand = rows.reduce((a,r) => ({ order_count: a.order_count+parseInt(r.order_count,10), revenue: a.revenue+parseFloat(r.revenue), unique_customers: a.unique_customers+parseInt(r.unique_customers,10) }), { order_count:0, revenue:0, unique_customers:0 });
    return {
      period: { from: formatDate(query.date_from), to: formatDate(query.date_to) },
      stores: rows.map((r, idx) => ({
        rank: idx+1, store: { id: r.store_uuid, name: r.store_name, city: r.city },
        order_count: parseInt(r.order_count,10), revenue: parseFloat(r.revenue).toFixed(2),
        avg_order_value: parseFloat(r.avg_order_value).toFixed(2), unique_customers: parseInt(r.unique_customers,10),
        completed_orders: parseInt(r.completed_orders,10)||0, cancelled_orders: parseInt(r.cancelled_orders,10)||0,
        revenue_share: grand.revenue > 0 ? ((parseFloat(r.revenue)/grand.revenue)*100).toFixed(1) : '0.0',
      })),
      grand_total: { order_count: grand.order_count, revenue: grand.revenue.toFixed(2), unique_customers: grand.unique_customers },
    };
  },

  async getChannelBreakdown(query) {
    const { where, params } = buildOrderWhere(query, 'o', true);
    const [rows] = await pool.query(
      `SELECT o.channel, COUNT(*) AS order_count, COALESCE(SUM(o.total_amount),0) AS revenue,
              SUM(o.status='completed') AS completed, SUM(o.status='cancelled') AS cancelled
         FROM orders o ${where} GROUP BY o.channel ORDER BY order_count DESC`, params
    );
    const grandCount = rows.reduce((a,r) => a + parseInt(r.order_count,10), 0);
    return rows.map((r) => ({
      channel: r.channel, order_count: parseInt(r.order_count,10), revenue: parseFloat(r.revenue).toFixed(2),
      completed: parseInt(r.completed,10)||0, cancelled: parseInt(r.cancelled,10)||0,
      share: grandCount > 0 ? ((parseInt(r.order_count,10)/grandCount)*100).toFixed(1) : '0.0',
    }));
  },

  async getCancellations(query) {
    const base   = [formatDate(query.date_from), formatDate(query.date_to)];
    const sp     = query.store_id ? [...base, Number(query.store_id)] : base;
    const sc     = query.store_id ? 'AND o.store_id = ?' : '';
    const [totalRows]  = await pool.query(`SELECT COUNT(*) AS total FROM orders o WHERE DATE(o.created_at) BETWEEN ? AND ? ${sc}`, sp);
    const [cancelRows] = await pool.query(`SELECT COUNT(*) AS cancelled_count, COALESCE(SUM(o.total_amount),0) AS cancelled_revenue, AVG(TIMESTAMPDIFF(MINUTE,o.created_at,o.cancelled_at)) AS avg_time_to_cancel_min FROM orders o WHERE o.status='cancelled' AND DATE(o.created_at) BETWEEN ? AND ? ${sc}`, sp);
    const [reasonRows] = await pool.query(`SELECT osh.notes AS reason, COUNT(*) AS count FROM order_status_history osh JOIN orders o ON o.id=osh.order_id WHERE osh.to_status='cancelled' AND osh.notes IS NOT NULL AND DATE(o.created_at) BETWEEN ? AND ? ${sc} GROUP BY osh.notes ORDER BY count DESC LIMIT 10`, sp);
    const total = parseInt(totalRows[0].total,10)||0;
    const cancelled = parseInt(cancelRows[0].cancelled_count,10)||0;
    return {
      period: { from: formatDate(query.date_from), to: formatDate(query.date_to), store_id: query.store_id||null },
      total_orders: total, cancelled_count: cancelled,
      cancellation_rate: total > 0 ? ((cancelled/total)*100).toFixed(1) : '0.0',
      cancelled_revenue: parseFloat(cancelRows[0].cancelled_revenue).toFixed(2),
      avg_time_to_cancel_minutes: cancelRows[0].avg_time_to_cancel_min ? parseFloat(cancelRows[0].avg_time_to_cancel_min).toFixed(1) : null,
      top_reasons: reasonRows.map((r) => ({ reason: r.reason, count: parseInt(r.count,10) })),
    };
  },


  async getCustomers(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = ["u.role = 'customer'"];
    const params     = [];
    if (query.search) { conditions.push('(u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ?)'); const s=`%${query.search}%`; params.push(s,s,s); }
    if (query.date_from) { conditions.push('DATE(u.created_at) >= ?'); params.push(formatDate(query.date_from)); }
    if (query.date_to)   { conditions.push('DATE(u.created_at) <= ?'); params.push(formatDate(query.date_to)); }
    if (query.is_active !== undefined) { conditions.push('u.is_active = ?'); params.push(query.is_active ? 1 : 0); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM users u ${where}`, params);
    const [rows] = await pool.query(
      `SELECT u.uuid, u.name, u.mobile, u.email, u.is_active, u.created_at, u.last_login_at,
              COUNT(DISTINCT o.id) AS total_orders, COALESCE(SUM(o.total_amount),0) AS total_spent, MAX(o.created_at) AS last_ordered_at
         FROM users u LEFT JOIN orders o ON o.customer_id=u.id AND o.status='completed'
         ${where} GROUP BY u.id ORDER BY total_spent DESC, u.created_at DESC
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`, params
    );
    return {
      customers: rows.map((r) => ({
        id: r.uuid, name: r.name, mobile: r.mobile, email: r.email, is_active: Boolean(r.is_active),
        total_orders: parseInt(r.total_orders,10)||0, total_spent: parseFloat(r.total_spent).toFixed(2),
        last_ordered_at: r.last_ordered_at, member_since: r.created_at, last_login_at: r.last_login_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  
  async getCustomDrinkStats(query) {
    const cond  = [];
    const p     = [];
    if (query.date_from) { cond.push('DATE(cd.created_at) >= ?'); p.push(formatDate(query.date_from)); }
    if (query.date_to)   { cond.push('DATE(cd.created_at) <= ?'); p.push(formatDate(query.date_to)); }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const lim   = parseInt(query.limit||20,10);

    const [topDrinks]      = await pool.query(`SELECT cd.uuid AS drink_id, cd.name AS drink_name, cd.order_count, cd.is_favourite, cd.total_price, cd.created_at, p.name AS base_product, u.name AS created_by, u.mobile AS customer_mobile FROM custom_drinks cd JOIN products p ON p.id=cd.base_product_id JOIN users u ON u.id=cd.customer_id ${where} ORDER BY cd.order_count DESC, cd.created_at DESC LIMIT ${lim}`, p);
    const [summaryRows]    = await pool.query(`SELECT COUNT(*) AS total_created, SUM(order_count) AS total_reorders, SUM(is_favourite) AS total_favourited, AVG(total_price) AS avg_price FROM custom_drinks cd ${where}`, p);
    const [topIngredients] = await pool.query(`SELECT i.name AS ingredient_name, i.unit, COUNT(DISTINCT cdi.custom_drink_id) AS drink_count, SUM(cdi.quantity) AS total_quantity_used FROM custom_drink_ingredients cdi JOIN ingredients i ON i.id=cdi.ingredient_id JOIN custom_drinks cd ON cd.id=cdi.custom_drink_id ${where} GROUP BY i.id ORDER BY drink_count DESC LIMIT 10`, p);

    const s = summaryRows[0];
    return {
      summary: { total_created: parseInt(s.total_created,10)||0, total_reorders: parseInt(s.total_reorders,10)||0, total_favourited: parseInt(s.total_favourited,10)||0, avg_price: parseFloat(s.avg_price||0).toFixed(2) },
      top_drinks: topDrinks.map((r,idx) => ({ rank: idx+1, id: r.drink_id, name: r.drink_name, base_product: r.base_product, reorder_count: parseInt(r.order_count,10), is_favourite: Boolean(r.is_favourite), price: parseFloat(r.total_price).toFixed(2), created_by: { name: r.created_by, mobile: r.customer_mobile }, created_at: r.created_at })),
      top_ingredients: topIngredients.map((r,idx) => ({ rank: idx+1, ingredient: r.ingredient_name, unit: r.unit, used_in_drinks: parseInt(r.drink_count,10), total_quantity_used: parseFloat(r.total_quantity_used) })),
    };
  },

 
  buildCSV(rows, columns) {
    const header = columns.map((c) => `"${c.label}"`).join(',');
    const body   = rows.map((row) =>
      columns.map((c) => {
        const val = c.key.split('.').reduce((o,k) => o?.[k], row) ?? '';
        return `"${String(val).replace(/"/g,'""')}"`;
      }).join(',')
    ).join('\n');
    return `${header}\n${body}`;
  },
};

module.exports = { reportsService };