


'use strict';

const { pool }                              = require('../../config/db');
const { AppError }                          = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { KOT_STATUS, ORDER_STATUS }          = require('../../config/constants');
const logger                                = require('../../utils/logger');

function getBaristaNotifier() {
  return require('../barista/barista.service').notifyKotStatusChange;
}
function getWhatsAppService() {
  return require('../whatsapp/whatsapp.service').whatsappService;
}
function getOrderService() {
  return require('../orders/order.service').orderService;
}

const kotService = {

  async getById(uuid) {
    const [kotRows] = await pool.execute(
      `SELECT
         k.id, k.uuid, k.kot_number, k.status,
         k.printed_at, k.started_at, k.completed_at,
         k.created_at, k.updated_at,
         o.uuid  AS order_uuid,  o.order_number, o.channel,
         o.notes AS order_notes, o.total_amount,
         s.id    AS store_id,    s.name AS store_name,
         b.uuid  AS barista_uuid, b.name AS barista_name,
         u.name  AS customer_name, u.mobile AS customer_mobile
       FROM kots k
       JOIN orders o    ON o.id  = k.order_id
       JOIN stores s    ON s.id  = k.store_id
       LEFT JOIN users b ON b.id = k.barista_id
       LEFT JOIN users u ON u.id = o.customer_id
       WHERE k.uuid = ? LIMIT 1`,
      [uuid]
    );
    if (!kotRows.length) throw new AppError('KOT not found.', 404, 'NOT_FOUND');
    const kot = kotRows[0];

    /* Order items */
    const [items] = await pool.execute(
      `SELECT
         oi.id   AS item_id,
         oi.item_name,
         oi.quantity,
         oi.unit_price,
         oi.total_price,
         oi.notes AS item_notes,
         oi.customizations,
         p.uuid  AS product_uuid
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = (SELECT id FROM orders WHERE uuid = ?)
       ORDER BY oi.id ASC`,
      [kot.order_uuid]
    );

    const itemsResolved = await Promise.all(
      items.map(async (item) => {
        const [ingredients] = await pool.execute(
          `SELECT
             i.name        AS ingredient_name,
             i.unit,
             i.preparation_notes,
             oii.quantity,
             oii.unit_price,
             oii.total_price
           FROM order_item_ingredients oii
           JOIN ingredients i ON i.id = oii.ingredient_id
           WHERE oii.order_item_id = ?
           ORDER BY i.display_order ASC, i.name ASC`,
          [item.item_id]
        );

        let parsedCustom = null;
        if (item.customizations) {
          try {
            parsedCustom = typeof item.customizations === 'string'
              ? JSON.parse(item.customizations)
              : item.customizations;
          } catch (_) { parsedCustom = null; }
        }

      
        const preparation_steps = ingredients
          .filter((ing) => ing.preparation_notes)
          .map((ing, idx) => ({
            step:        idx + 1,
            instruction: ing.preparation_notes,
            ingredient:  ing.ingredient_name,
            quantity:    parseFloat(ing.quantity),
            unit:        ing.unit || null,
          }));

        return {
          name:        item.item_name,
          quantity:    item.quantity,
          unit_price:  parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price),
          notes:       item.item_notes || null,
          custom_name: parsedCustom?.name || null,
          ingredients: ingredients.map((ing) => ({
            name:     ing.ingredient_name,
            unit:     ing.unit     || null,
            quantity: parseFloat(ing.quantity),
          })),
          preparation_steps,
        };
      })
    );

    const [history] = await pool.execute(
      `SELECT ksh.from_status, ksh.to_status, ksh.notes,
              ksh.created_at, u.name AS changed_by_name
         FROM kot_status_history ksh
         LEFT JOIN users u ON u.id = ksh.changed_by
         WHERE ksh.kot_id = ?
         ORDER BY ksh.created_at ASC`,
      [kot.id]
    );

    return formatKOT(kot, itemsResolved, history);
  },

  async getList(query, requester) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params     = [];

    const storeId = (requester.role === 'barista' || requester.role === 'store_manager')
      ? requester.storeId
      : query.store_id || null;

    if (storeId)      { conditions.push('k.store_id = ?'); params.push(Number(storeId)); }
    if (query.status) { conditions.push('k.status = ?');   params.push(String(query.status)); }

    const dateFilter = query.date
      ? new Date(query.date).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    conditions.push('DATE(k.created_at) = ?');
    params.push(dateFilter);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM kots k ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT
         k.uuid, k.kot_number, k.status,
         k.printed_at, k.started_at, k.completed_at, k.created_at,
         o.uuid  AS order_uuid, o.order_number, o.channel,
         u.name  AS customer_name, u.mobile AS customer_mobile,
         b.name  AS barista_name,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM kots k
       JOIN orders o    ON o.id = k.order_id
       LEFT JOIN users u ON u.id = o.customer_id
       LEFT JOIN users b ON b.id = k.barista_id
       ${where}
       ORDER BY
         CASE k.status
           WHEN 'open'        THEN 1
           WHEN 'in_progress' THEN 2
           WHEN 'done'        THEN 3
           WHEN 'cancelled'   THEN 4
           ELSE 5
         END ASC,
         k.created_at ASC
       LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    return {
      kots: rows.map(formatKOTSummary),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async markPrinted(uuid) {
    const [kotRows] = await pool.execute(
      'SELECT id, uuid, kot_number, printed_at FROM kots WHERE uuid = ? LIMIT 1',
      [uuid]
    );
    if (!kotRows.length) throw new AppError('KOT not found.', 404, 'NOT_FOUND');
    const kot = kotRows[0];

    if (!kot.printed_at) {
      await pool.execute('UPDATE kots SET printed_at = NOW() WHERE id = ?', [kot.id]);
      logger.info(`[KOT] ${kot.kot_number} printed.`);
    }

    return kotService.getById(uuid);
  },

  async reprint(uuid, requestedBy) {
    const [kotRows] = await pool.execute(
      'SELECT id, uuid, kot_number, status FROM kots WHERE uuid = ? LIMIT 1',
      [uuid]
    );
    if (!kotRows.length) throw new AppError('KOT not found.', 404, 'NOT_FOUND');
    const kot = kotRows[0];

    if (kot.status === KOT_STATUS.CANCELLED)
      throw new AppError('Cannot re-print a cancelled KOT.', 400, 'KOT_CANCELLED');

    await pool.execute('UPDATE kots SET printed_at = NOW() WHERE id = ?', [kot.id]);

    await _insertHistory(kot.id, kot.status, kot.status, requestedBy, 'Re-printed by staff');

    logger.info(`[KOT] ${kot.kot_number} re-printed by user ${requestedBy}.`);
    return kotService.getById(uuid);
  },

  async updateStatus(uuid, newStatus, baristaId) {
    const [kotRows] = await pool.execute(
      `SELECT k.id, k.uuid, k.kot_number, k.status, k.order_id,
              o.uuid AS order_uuid
         FROM kots k
         JOIN orders o ON o.id = k.order_id
         WHERE k.uuid = ? LIMIT 1`,
      [uuid]
    );
    if (!kotRows.length) throw new AppError('KOT not found.', 404, 'NOT_FOUND');
    const kot = kotRows[0];

    const allowed = {
      [KOT_STATUS.OPEN]:        [KOT_STATUS.IN_PROGRESS, KOT_STATUS.CANCELLED],
      [KOT_STATUS.IN_PROGRESS]: [KOT_STATUS.DONE, KOT_STATUS.CANCELLED],
      [KOT_STATUS.DONE]:        [],
      [KOT_STATUS.CANCELLED]:   [],
    };
    if (!allowed[kot.status]?.includes(newStatus)) {
      throw new AppError(
        `Cannot transition KOT from "${kot.status}" to "${newStatus}".`,
        400, 'INVALID_KOT_TRANSITION'
      );
    }

    const updates = ['status = ?'];
    const values  = [newStatus];

    if (newStatus === KOT_STATUS.IN_PROGRESS) {
      updates.push('started_at = NOW()');
      if (baristaId) { updates.push('barista_id = ?'); values.push(baristaId); }
    }
    if (newStatus === KOT_STATUS.DONE) {
      updates.push('completed_at = NOW()');
    }
    values.push(kot.id);

    await pool.execute(`UPDATE kots SET ${updates.join(', ')} WHERE id = ?`, values);

    await _insertHistory(kot.id, kot.status, newStatus, baristaId, null);

 
    const orderStatusMap = {
      [KOT_STATUS.IN_PROGRESS]: ORDER_STATUS.IN_PROGRESS,
      [KOT_STATUS.DONE]:        ORDER_STATUS.READY,
      [KOT_STATUS.CANCELLED]:   ORDER_STATUS.CANCELLED,
    };

    if (orderStatusMap[newStatus]) {
      try {
        const [orderCheck] = await pool.execute(
          `SELECT status FROM orders WHERE id = ? LIMIT 1`, [kot.order_id]
        );
        const orderStatus = orderCheck[0]?.status;
        const terminalStates = ['completed', 'cancelled', 'refunded'];

        if (!terminalStates.includes(orderStatus)) {
          await getOrderService().updateStatus(
            kot.order_uuid,
            orderStatusMap[newStatus],
            baristaId,
            `Mirrored from KOT ${kot.kot_number}`
          );
        }
      } catch (orderErr) {
        logger.warn(
          `[KOT] Order mirror failed for ${kot.kot_number}: ${orderErr.message}`
        );
      }
    }

    logger.info(`[KOT] ${kot.kot_number} → ${newStatus} by barista ${baristaId || 'system'}`);
    const updatedKot = await kotService.getById(uuid);

    try {
      getBaristaNotifier()(kot.order_id, {
        event:      'kot_status_changed',
        kot_uuid:   updatedKot.id,
        kot_number: updatedKot.kot_number,
        new_status: newStatus,
        store_id:   updatedKot.store?.id,
      });
    } catch (wsErr) {
      logger.warn('[KOT] WS push failed (non-fatal):', wsErr.message);
    }

    return updatedKot;
  },

  async getPendingCount(storeId) {
    const [rows] = await pool.execute(
      `SELECT
         SUM(status = 'open')        AS open_count,
         SUM(status = 'in_progress') AS in_progress_count
       FROM kots
       WHERE store_id = ? AND DATE(created_at) = CURDATE()`,
      [storeId]
    );
    return {
      open:        parseInt(rows[0].open_count,        10) || 0,
      in_progress: parseInt(rows[0].in_progress_count, 10) || 0,
    };
  },

  async getHistory(uuid) {
    const [kotRows] = await pool.execute(
      'SELECT id, kot_number FROM kots WHERE uuid = ? LIMIT 1', [uuid]
    );
    if (!kotRows.length) throw new AppError('KOT not found.', 404, 'NOT_FOUND');

    const [rows] = await pool.execute(
      `SELECT ksh.from_status, ksh.to_status, ksh.notes,
              ksh.created_at, u.name AS changed_by_name
         FROM kot_status_history ksh
         LEFT JOIN users u ON u.id = ksh.changed_by
         WHERE ksh.kot_id = ?
         ORDER BY ksh.created_at ASC`,
      [kotRows[0].id]
    );

    return {
      kot_number: kotRows[0].kot_number,
      history:    rows,
    };
  },
};


async function _insertHistory(kotId, fromStatus, toStatus, changedBy, notes) {
  await pool.execute(
    `INSERT INTO kot_status_history
       (kot_id, from_status, to_status, changed_by, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [kotId, fromStatus || null, toStatus, changedBy || null, notes || null]
  );
}


function formatKOT(kot, items, history = []) {
  return {
    id:         kot.uuid,
    kot_number: kot.kot_number,
    status:     kot.status,
    store: {
      id:   kot.store_id,
      name: kot.store_name,
    },
    order: {
      id:           kot.order_uuid,
      order_number: kot.order_number,
      channel:      kot.channel,
      notes:        kot.order_notes,
      total_amount: parseFloat(kot.total_amount),
    },
    customer: kot.customer_mobile
      ? { name: kot.customer_name, mobile: kot.customer_mobile }
      : null,
    barista: kot.barista_name
      ? { uuid: kot.barista_uuid, name: kot.barista_name }
      : null,
    items,
    status_history: history.map((h) => ({
      from:       h.from_status,
      to:         h.to_status,
      changed_by: h.changed_by_name || 'system',
      notes:      h.notes || null,
      at:         h.created_at,
    })),
    timestamps: {
      created_at:   kot.created_at,
      printed_at:   kot.printed_at   || null,
      started_at:   kot.started_at   || null,
      completed_at: kot.completed_at || null,
    },
  };
}

function formatKOTSummary(row) {
  return {
    id:           row.uuid,
    kot_number:   row.kot_number,
    status:       row.status,
    order_number: row.order_number,
    channel:      row.channel,
    customer:     row.customer_mobile
      ? { name: row.customer_name, mobile: row.customer_mobile }
      : null,
    barista:    row.barista_name || null,
    item_count: parseInt(row.item_count, 10),
    is_printed: Boolean(row.printed_at),
    timestamps: {
      created_at:   row.created_at,
      started_at:   row.started_at   || null,
      completed_at: row.completed_at || null,
    },
  };
}

module.exports = { kotService };