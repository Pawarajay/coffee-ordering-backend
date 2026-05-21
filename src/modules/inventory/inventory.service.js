

'use strict';

const { pool }        = require('../../config/db');
const { AppError }    = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { INVENTORY_TXN_TYPE, STOCK_ALERT }      = require('../../config/constants');
const { broadcast, WS_EVENTS }                 = require('../../websocket/wsServer');
const logger          = require('../../utils/logger');


async function getOrCreateStockRow(connection, storeId, ingredientId) {
  await connection.execute(
    `INSERT INTO inventory (store_id, ingredient_id, quantity, reserved_qty)
     VALUES (?, ?, 0, 0)
     ON DUPLICATE KEY UPDATE store_id = store_id`, 
    [storeId, ingredientId]
  );
  const [rows] = await connection.execute(
    `SELECT quantity, reserved_qty FROM inventory
       WHERE store_id = ? AND ingredient_id = ? LIMIT 1`,
    [storeId, ingredientId]
  );
  return rows[0];
}

async function recordTransaction(connection, {
  storeId, ingredientId, txnType, quantityDelta, balanceAfter,
  referenceType = null, referenceId = null, notes = null, createdBy = null,
}) {
  await connection.execute(
    `INSERT INTO inventory_transactions
       (store_id, ingredient_id, txn_type, quantity, balance_after,
        reference_type, reference_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [storeId, ingredientId, txnType, quantityDelta, balanceAfter,
     referenceType, referenceId, notes, createdBy]
  );
}

async function evaluateAndRaiseAlert(connection, storeId, ingredientId, currentQty) {
  const [ingRows] = await connection.execute(
    `SELECT name, low_stock_threshold, critical_stock_threshold
       FROM ingredients WHERE id = ? LIMIT 1`,
    [ingredientId]
  );
  if (!ingRows.length) return;
  const { name, low_stock_threshold: low, critical_stock_threshold: critical } = ingRows[0];

  let alertType = null;
  if (currentQty <= 0)             alertType = STOCK_ALERT.OUT_OF_STOCK;
  else if (currentQty <= critical) alertType = STOCK_ALERT.CRITICAL;
  else if (currentQty <= low)      alertType = STOCK_ALERT.LOW;

  if (alertType) {
  
    await connection.execute(
      `INSERT INTO stock_alerts
         (store_id, ingredient_id, alert_type, quantity_at_alert, is_resolved)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         alert_type        = VALUES(alert_type),
         quantity_at_alert = VALUES(quantity_at_alert)`,
      [storeId, ingredientId, alertType, currentQty]
    );
    logger.warn(
      `[Inventory] Alert "${alertType}" for ${name} at store ${storeId} — qty: ${currentQty}`
    );
    broadcast(storeId, WS_EVENTS.STOCK_ALERT, {
      ingredient_id: ingredientId, ingredient_name: name,
      alert_type: alertType, quantity: currentQty,
    });
  } else {
    /* Stock recovered — auto-resolve any open alerts for this ingredient */
    await connection.execute(
      `UPDATE stock_alerts SET is_resolved = 1, resolved_at = NOW()
         WHERE store_id = ? AND ingredient_id = ? AND is_resolved = 0`,
      [storeId, ingredientId]
    );
  }
}


const inventoryService = {

  async getStockLevels(query) {
    const { page, limit, offset } = parsePagination(query);
    const { store_id, alert_level, search } = query;

    const conditions = ['inv.store_id = ?'];
    const params     = [Number(store_id)];

    if (search) { conditions.push('i.name LIKE ?'); params.push(`%${search}%`); }

    const level = alert_level || 'all';
    if (level === STOCK_ALERT.OUT_OF_STOCK)
      conditions.push('inv.quantity <= 0');
    else if (level === STOCK_ALERT.CRITICAL)
      conditions.push('inv.quantity > 0 AND inv.quantity <= i.critical_stock_threshold');
    else if (level === STOCK_ALERT.LOW)
      conditions.push('inv.quantity > i.critical_stock_threshold AND inv.quantity <= i.low_stock_threshold');

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory inv
         JOIN ingredients i ON i.id = inv.ingredient_id ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT inv.store_id,
         i.id AS ingredient_id, i.uuid AS ingredient_uuid, i.name, i.unit,
         i.low_stock_threshold, i.critical_stock_threshold,
         inv.quantity, inv.reserved_qty,
         (inv.quantity - inv.reserved_qty) AS available_qty,
         inv.updated_at,
         CASE
           WHEN inv.quantity <= 0                          THEN 'out_of_stock'
           WHEN inv.quantity <= i.critical_stock_threshold THEN 'critical'
           WHEN inv.quantity <= i.low_stock_threshold      THEN 'low'
           ELSE 'ok'
         END AS alert_level
       FROM inventory inv
       JOIN ingredients i ON i.id = inv.ingredient_id
       ${where}
       ORDER BY
         CASE
           WHEN inv.quantity <= 0                          THEN 1
           WHEN inv.quantity <= i.critical_stock_threshold THEN 2
           WHEN inv.quantity <= i.low_stock_threshold      THEN 3
           ELSE 4
         END ASC, i.name ASC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      stock: rows.map(formatStockRow),
      meta:  buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async stockIn(data, userId) {
    const { store_id, ingredient_id, quantity, notes, reference_id } = data;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await getOrCreateStockRow(connection, store_id, ingredient_id);
      const newQty  = parseFloat(current.quantity) + parseFloat(quantity);
      await connection.execute(
        `UPDATE inventory SET quantity = ? WHERE store_id = ? AND ingredient_id = ?`,
        [newQty, store_id, ingredient_id]
      );
      await recordTransaction(connection, {
        storeId: store_id, ingredientId: ingredient_id,
        txnType: INVENTORY_TXN_TYPE.STOCK_IN,
        quantityDelta: parseFloat(quantity), balanceAfter: newQty,
        referenceType: reference_id ? 'purchase_order' : null,
        referenceId: reference_id || null, notes, createdBy: userId,
      });
      await evaluateAndRaiseAlert(connection, store_id, ingredient_id, newQty);
      await connection.commit();
      logger.info(`[Inventory] Stock-in: +${quantity} for ingredient ${ingredient_id}. Balance: ${newQty}`);
      return { ingredient_id, new_quantity: newQty };
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },

  async adjust(data, userId) {
    const { store_id, ingredient_id, new_quantity, notes } = data;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await getOrCreateStockRow(connection, store_id, ingredient_id);
      const delta   = parseFloat(new_quantity) - parseFloat(current.quantity);
      await connection.execute(
        `UPDATE inventory SET quantity = ? WHERE store_id = ? AND ingredient_id = ?`,
        [new_quantity, store_id, ingredient_id]
      );
      await recordTransaction(connection, {
        storeId: store_id, ingredientId: ingredient_id,
        txnType: INVENTORY_TXN_TYPE.ADJUSTMENT,
        quantityDelta: delta, balanceAfter: new_quantity,
        referenceType: 'manual', notes, createdBy: userId,
      });
      await evaluateAndRaiseAlert(connection, store_id, ingredient_id, new_quantity);
      await connection.commit();
      return { ingredient_id, new_quantity, delta };
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },

  async recordWastage(data, userId) {
    const { store_id, ingredient_id, quantity, notes } = data;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const current = await getOrCreateStockRow(connection, store_id, ingredient_id);
      const newQty  = Math.max(0, parseFloat(current.quantity) - parseFloat(quantity));
      await connection.execute(
        `UPDATE inventory SET quantity = ? WHERE store_id = ? AND ingredient_id = ?`,
        [newQty, store_id, ingredient_id]
      );
      await recordTransaction(connection, {
        storeId: store_id, ingredientId: ingredient_id,
        txnType: INVENTORY_TXN_TYPE.WASTAGE,
        quantityDelta: -parseFloat(quantity), balanceAfter: newQty,
        referenceType: 'wastage', notes, createdBy: userId,
      });
      await evaluateAndRaiseAlert(connection, store_id, ingredient_id, newQty);
      await connection.commit();
      return { ingredient_id, quantity_written_off: quantity, new_quantity: newQty };
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },

 
  async deductForOrder(orderId, storeId, operatorUserId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let resolvedStoreId = storeId;
      if (!resolvedStoreId) {
        const [orderRows] = await connection.execute(
          'SELECT store_id FROM orders WHERE id = ? LIMIT 1', [orderId]
        );
        if (!orderRows.length)
          throw new AppError('Order not found for inventory deduction.', 404, 'NOT_FOUND');
        resolvedStoreId = orderRows[0].store_id;
      }

      const [items] = await connection.execute(
        `SELECT oi.id, oi.product_id, oi.quantity AS item_qty
           FROM order_items oi WHERE oi.order_id = ?`,
        [orderId]
      );

      for (const item of items) {
        const [cyodIngredients] = await connection.execute(
          `SELECT ingredient_id, quantity FROM order_item_ingredients
             WHERE order_item_id = ?`,
          [item.id]
        );

        const ingredientsToDeduct = cyodIngredients.length > 0
          ? cyodIngredients.map((ci) => ({
              ingredient_id: ci.ingredient_id,
              qty: parseFloat(ci.quantity) * item.item_qty,
            }))
          : await (async () => {
              const [mappings] = await connection.execute(
                `SELECT ingredient_id, quantity FROM ingredient_mappings
                   WHERE product_id = ? AND is_default = 1`,
                [item.product_id]
              );
              return mappings.map((m) => ({
                ingredient_id: m.ingredient_id,
                qty: parseFloat(m.quantity) * item.item_qty,
              }));
            })();

        for (const ing of ingredientsToDeduct) {
          const current = await getOrCreateStockRow(
            connection, resolvedStoreId, ing.ingredient_id
          );
          const newQty = Math.max(0, parseFloat(current.quantity) - ing.qty);
          await connection.execute(
            `UPDATE inventory SET quantity = ?
               WHERE store_id = ? AND ingredient_id = ?`,
            [newQty, resolvedStoreId, ing.ingredient_id]
          );
          await recordTransaction(connection, {
            storeId:       resolvedStoreId,
            ingredientId:  ing.ingredient_id,
            txnType:       INVENTORY_TXN_TYPE.STOCK_OUT,
            quantityDelta: -ing.qty,
            balanceAfter:  newQty,
            referenceType: 'order',
            referenceId:   orderId,
            notes:         `Order deduction — order #${orderId}`,
            createdBy:     operatorUserId,
          });
          await evaluateAndRaiseAlert(
            connection, resolvedStoreId, ing.ingredient_id, newQty
          );
        }
      }

      await connection.commit();
      logger.info(
        `[Inventory] Deducted for order ${orderId} at store ${resolvedStoreId}`
      );
    } catch (err) {
      await connection.rollback();
      logger.error(`[Inventory] Deduction failed for order ${orderId}: ${err.message}`);
    } finally { connection.release(); }
  },

  /* ── Transaction audit trail ───────────────────────────────────────────── */
  async getTransactions(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = ['it.store_id = ?'];
    const params     = [Number(query.store_id)];

    if (query.ingredient_id) { conditions.push('it.ingredient_id = ?'); params.push(Number(query.ingredient_id)); }
    if (query.txn_type)      { conditions.push('it.txn_type = ?');      params.push(String(query.txn_type)); }
    if (query.date_from)     { conditions.push('it.created_at >= ?');   params.push(query.date_from); }
    if (query.date_to)       { conditions.push('it.created_at <= ?');   params.push(query.date_to); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory_transactions it ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT it.id, it.txn_type, it.quantity AS delta,
         it.balance_after, it.reference_type, it.reference_id,
         it.notes, it.created_at,
         i.name AS ingredient_name, i.unit,
         u.name AS created_by_name
       FROM inventory_transactions it
       JOIN ingredients i ON i.id = it.ingredient_id
       LEFT JOIN users u  ON u.id = it.created_by
       ${where}
       ORDER BY it.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      transactions: rows.map((r) => ({
        id:             r.id,
        type:           r.txn_type,
        ingredient:     { name: r.ingredient_name, unit: r.unit },
        quantity_delta: parseFloat(r.delta),
        balance_after:  parseFloat(r.balance_after),
        reference:      r.reference_type
          ? { type: r.reference_type, id: r.reference_id } : null,
        notes:          r.notes,
        created_by:     r.created_by_name || 'System',
        created_at:     r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getAlerts(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = ['sa.store_id = ?', 'sa.is_resolved = ?'];
    const params     = [Number(query.store_id), query.is_resolved ? 1 : 0];

    if (query.alert_type) { conditions.push('sa.alert_type = ?'); params.push(String(query.alert_type)); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM stock_alerts sa ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT sa.id, sa.alert_type, sa.quantity_at_alert,
         sa.is_resolved, sa.resolved_at, sa.created_at,
         i.uuid AS ingredient_uuid, i.name AS ingredient_name, i.unit,
         i.low_stock_threshold, i.critical_stock_threshold,
         COALESCE(inv.quantity, 0) AS current_quantity
       FROM stock_alerts sa
       JOIN ingredients i ON i.id = sa.ingredient_id
       LEFT JOIN inventory inv
         ON inv.store_id = sa.store_id AND inv.ingredient_id = sa.ingredient_id
       ${where}
       ORDER BY
         CASE sa.alert_type
           WHEN 'out_of_stock' THEN 1
           WHEN 'critical'     THEN 2
           WHEN 'low'          THEN 3
           ELSE 4
         END ASC, sa.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      alerts: rows.map((r) => ({
        id:         r.id,
        alert_type: r.alert_type,
        ingredient: {
          id:                       r.ingredient_uuid,
          name:                     r.ingredient_name,
          unit:                     r.unit,
          low_stock_threshold:      parseFloat(r.low_stock_threshold),
          critical_stock_threshold: parseFloat(r.critical_stock_threshold),
        },
        quantity_at_alert: parseFloat(r.quantity_at_alert),
        current_quantity:  parseFloat(r.current_quantity),
        is_resolved:       Boolean(r.is_resolved),
        resolved_at:       r.resolved_at,
        created_at:        r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async resolveAlert(alertId, userId) {
    const [rows] = await pool.execute(
      'SELECT id, is_resolved FROM stock_alerts WHERE id = ? LIMIT 1', [alertId]
    );
    if (!rows.length)     throw new AppError('Alert not found.', 404, 'NOT_FOUND');
    if (rows[0].is_resolved)
      throw new AppError('Alert is already resolved.', 409, 'ALREADY_RESOLVED');
    await pool.execute(
      'UPDATE stock_alerts SET is_resolved = 1, resolved_at = NOW() WHERE id = ?',
      [alertId]
    );
    return { id: alertId, resolved: true };
  },

  async getAlertSummary(storeId) {
    const [rows] = await pool.execute(
      `SELECT
         SUM(alert_type = 'out_of_stock') AS out_of_stock,
         SUM(alert_type = 'critical')     AS critical,
         SUM(alert_type = 'low')          AS low
       FROM stock_alerts WHERE store_id = ? AND is_resolved = 0`,
      [storeId]
    );
    return {
      out_of_stock: parseInt(rows[0].out_of_stock, 10) || 0,
      critical:     parseInt(rows[0].critical,     10) || 0,
      low:          parseInt(rows[0].low,          10) || 0,
    };
  },

  async runThresholdScan() {
    logger.info('[Inventory] Running scheduled threshold scan...');
    const [rows] = await pool.execute(
      `SELECT inv.store_id, inv.ingredient_id, inv.quantity
         FROM inventory inv JOIN ingredients i ON i.id = inv.ingredient_id`
    );
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const row of rows) {
        await evaluateAndRaiseAlert(
          connection, row.store_id, row.ingredient_id, parseFloat(row.quantity)
        );
      }
      await connection.commit();
      logger.info(`[Inventory] Threshold scan complete. Rows checked: ${rows.length}`);
    } catch (err) {
      await connection.rollback();
      logger.error('[Inventory] Threshold scan failed:', err.message);
    } finally { connection.release(); }
  },

  async centralRawMaterialIn(data, userId) {
    const { facility_id, ingredient_id, quantity, notes, reference_id } = data;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO central_inventory (facility_id, ingredient_id, quantity)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE facility_id = facility_id`,
        [facility_id, ingredient_id]
      );

      await connection.execute(
        `UPDATE central_inventory SET quantity = quantity + ?
           WHERE facility_id = ? AND ingredient_id = ?`,
        [parseFloat(quantity), facility_id, ingredient_id]
      );

      const [[current]] = await connection.execute(
        `SELECT quantity FROM central_inventory
           WHERE facility_id = ? AND ingredient_id = ? LIMIT 1`,
        [facility_id, ingredient_id]
      );

      await connection.execute(
        `INSERT INTO central_inventory_transactions
           (facility_id, ingredient_id, txn_type, quantity, balance_after,
            reference_id, notes, created_by)
         VALUES (?, ?, 'raw_material_in', ?, ?, ?, ?, ?)`,
        [facility_id, ingredient_id, parseFloat(quantity),
         parseFloat(current.quantity), reference_id || null, notes || null, userId]
      );

      await connection.commit();
      logger.info(
        `[CentralInventory] Raw material in: +${quantity} for ingredient ${ingredient_id}`
      );
      return { facility_id, ingredient_id, new_quantity: parseFloat(current.quantity) };
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },

  async createProductionBatch(data, userId) {
    const {
      facility_id,
      product_id,            
      output_quantity_ml,      
      output_units,           
      raw_materials,          
      batch_notes,
    } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const rm of raw_materials) {
        const [[current]] = await connection.execute(
          `SELECT quantity FROM central_inventory
             WHERE facility_id = ? AND ingredient_id = ? LIMIT 1`,
          [facility_id, rm.ingredient_id]
        );
        if (!current || parseFloat(current.quantity) < rm.quantity_used) {
          throw new AppError(
            `Insufficient raw material (ingredient ${rm.ingredient_id}). ` +
            `Available: ${current?.quantity || 0}, Required: ${rm.quantity_used}`,
            400, 'INSUFFICIENT_STOCK'
          );
        }
        const newQty = parseFloat(current.quantity) - rm.quantity_used;
        await connection.execute(
          `UPDATE central_inventory SET quantity = ?
             WHERE facility_id = ? AND ingredient_id = ?`,
          [newQty, facility_id, rm.ingredient_id]
        );
        await connection.execute(
          `INSERT INTO central_inventory_transactions
             (facility_id, ingredient_id, txn_type, quantity, balance_after, notes, created_by)
           VALUES (?, ?, 'production_deduction', ?, ?, ?, ?)`,
          [facility_id, rm.ingredient_id, -rm.quantity_used, newQty,
           `Batch production: ${output_quantity_ml}ml`, userId]
        );
      }

      const [batchResult] = await connection.execute(
        `INSERT INTO production_batches
           (uuid, facility_id, product_id, output_quantity_ml, output_units,
            status, batch_notes, created_by)
         VALUES (UUID(), ?, ?, ?, ?, 'produced', ?, ?)`,
        [facility_id, product_id, output_quantity_ml, output_units,
         batch_notes || null, userId]
      );

      await connection.commit();
      logger.info(
        `[Production] Batch created: ${output_units} units (${output_quantity_ml}ml) ` +
        `of product ${product_id} at facility ${facility_id}`
      );

      const [[batch]] = await pool.execute(
        `SELECT uuid, facility_id, product_id, output_quantity_ml,
                output_units, status, batch_notes, created_at
           FROM production_batches WHERE id = ? LIMIT 1`,
        [batchResult.insertId]
      );
      return batch;
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },


  async distributeToChannel(data, userId) {
    const {
      facility_id,
      batch_uuid,
      channel,             
      store_id,             
      quantity_units,      
      notes,
    } = data;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[batch]] = await connection.execute(
        `SELECT id, product_id, output_units, distributed_units
           FROM production_batches WHERE uuid = ? AND facility_id = ? LIMIT 1`,
        [batch_uuid, facility_id]
      );
      if (!batch)
        throw new AppError('Production batch not found.', 404, 'BATCH_NOT_FOUND');

      const available = batch.output_units - (batch.distributed_units || 0);
      if (quantity_units > available)
        throw new AppError(
          `Only ${available} units available in this batch.`,
          400, 'INSUFFICIENT_BATCH_STOCK'
        );

      const [distResult] = await connection.execute(
        `INSERT INTO distribution_orders
           (uuid, facility_id, batch_id, channel, store_id,
            quantity_units, status, notes, created_by)
         VALUES (UUID(), ?, ?, ?, ?, ?, 'dispatched', ?, ?)`,
        [facility_id, batch.id, channel, store_id || null,
         quantity_units, notes || null, userId]
      );

      await connection.execute(
        `UPDATE production_batches
           SET distributed_units = COALESCE(distributed_units, 0) + ?
           WHERE id = ?`,
        [quantity_units, batch.id]
      );

      if (channel === 'kiosk' && store_id) {
        await connection.execute(
          `INSERT INTO inventory (store_id, ingredient_id, quantity, reserved_qty)
           SELECT ?, im.ingredient_id,
                  (? * im.quantity), 0
             FROM ingredient_mappings im
             WHERE im.product_id = ? AND im.is_default = 1
           ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
          [store_id, quantity_units, batch.product_id]
        );
      }

      await connection.commit();
      logger.info(
        `[Distribution] ${quantity_units} units dispatched to ${channel}` +
        (store_id ? ` (store ${store_id})` : '')
      );

      const [[dist]] = await pool.execute(
        `SELECT uuid, channel, store_id, quantity_units, status, created_at
           FROM distribution_orders WHERE id = ? LIMIT 1`,
        [distResult.insertId]
      );
      return dist;
    } catch (err) { await connection.rollback(); throw err; }
    finally { connection.release(); }
  },


  async getProductionBatches(query) {
    const { page, limit, offset } = parsePagination(query);
    const { facility_id, status } = query;

    const conditions = ['pb.facility_id = ?'];
    const params     = [Number(facility_id)];
    if (status) { conditions.push('pb.status = ?'); params.push(status); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM production_batches pb ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT pb.uuid, pb.output_quantity_ml, pb.output_units,
         pb.distributed_units, pb.status, pb.batch_notes, pb.created_at,
         p.name AS product_name, p.uuid AS product_uuid,
         u.name AS created_by_name
       FROM production_batches pb
       JOIN products p ON p.id = pb.product_id
       LEFT JOIN users u ON u.id = pb.created_by
       ${where}
       ORDER BY pb.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      batches: rows.map((r) => ({
        id:                  r.uuid,
        product:             { id: r.product_uuid, name: r.product_name },
        output_quantity_ml:  r.output_quantity_ml,
        output_units:        r.output_units,
        distributed_units:   r.distributed_units || 0,
        available_units:     r.output_units - (r.distributed_units || 0),
        status:              r.status,
        notes:               r.batch_notes,
        created_by:          r.created_by_name,
        created_at:          r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

 
  async getDistributionOrders(query) {
    const { page, limit, offset } = parsePagination(query);
    const { facility_id, channel, store_id } = query;

    const conditions = ['do_t.facility_id = ?'];
    const params     = [Number(facility_id)];
    if (channel)  { conditions.push('do_t.channel = ?');   params.push(channel); }
    if (store_id) { conditions.push('do_t.store_id = ?');  params.push(Number(store_id)); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM distribution_orders do_t ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT do_t.uuid, do_t.channel, do_t.store_id,
         do_t.quantity_units, do_t.status, do_t.notes, do_t.created_at,
         p.name AS product_name,
         s.name AS store_name,
         u.name AS created_by_name
       FROM distribution_orders do_t
       JOIN production_batches pb ON pb.id = do_t.batch_id
       JOIN products p            ON p.id  = pb.product_id
       LEFT JOIN stores s         ON s.id  = do_t.store_id
       LEFT JOIN users u          ON u.id  = do_t.created_by
       ${where}
       ORDER BY do_t.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      distributions: rows.map((r) => ({
        id:             r.uuid,
        product:        r.product_name,
        channel:        r.channel,
        store:          r.store_name || null,
        quantity_units: r.quantity_units,
        status:         r.status,
        notes:          r.notes,
        created_by:     r.created_by_name,
        created_at:     r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },
};


function formatStockRow(row) {
  return {
    ingredient:    { id: row.ingredient_uuid, name: row.name, unit: row.unit },
    quantity:      parseFloat(row.quantity),
    reserved_qty:  parseFloat(row.reserved_qty),
    available_qty: parseFloat(row.available_qty),
    thresholds: {
      low:      parseFloat(row.low_stock_threshold),
      critical: parseFloat(row.critical_stock_threshold),
    },
    alert_level: row.alert_level,
    updated_at:  row.updated_at,
  };
}

module.exports = { inventoryService };