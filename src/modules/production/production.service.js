


'use strict';

const { pool }                                 = require('../../config/db');
const { AppError }                             = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const logger                                   = require('../../utils/logger');


async function generateBatchNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM production_batches WHERE DATE(produced_at) = CURDATE()`
  );
  const seq = String(rows[0].cnt + 1).padStart(4, '0');
  return `BATCH-${date}-${seq}`;
}


async function getOrCreateCentralRM(connection, ingredientId, forUpdate = false) {
  await connection.execute(
    `INSERT INTO central_raw_materials (ingredient_id, quantity)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE ingredient_id = ingredient_id`,
    [ingredientId]
  );
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT quantity FROM central_raw_materials
       WHERE ingredient_id = ? LIMIT 1 ${lockClause}`,
    [ingredientId]
  );
  return parseFloat(rows[0].quantity);
}

async function getOrCreateCentralInventory(connection, productId, forUpdate = false) {
  await connection.execute(
    `INSERT INTO central_inventory (product_id, quantity_ml)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE product_id = product_id`,
    [productId]
  );
  const lockClause = forUpdate ? 'FOR UPDATE' : '';
  const [rows] = await connection.execute(
    `SELECT quantity_ml FROM central_inventory
       WHERE product_id = ? LIMIT 1 ${lockClause}`,
    [productId]
  );
  return parseFloat(rows[0].quantity_ml);
}

async function recordCentralRMTxn(connection, {
  ingredientId, txnType, quantity, balanceAfter,
  referenceType = null, referenceId = null, notes = null, createdBy = null,
}) {
  await connection.execute(
    `INSERT INTO central_raw_material_transactions
       (ingredient_id, txn_type, quantity, balance_after,
        reference_type, reference_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [ingredientId, txnType, quantity, balanceAfter,
     referenceType, referenceId, notes, createdBy]
  );
}


const productionService = {


  async rawMaterialStockIn(data, userId) {
    const { ingredient_id, quantity, notes } = data;

    const [ingRows] = await pool.execute(
      'SELECT id, name, unit FROM ingredients WHERE id = ? LIMIT 1',
      [ingredient_id]
    );
    if (!ingRows.length) throw new AppError('Ingredient not found.', 404, 'NOT_FOUND');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const currentQty = await getOrCreateCentralRM(connection, ingredient_id, true);
      const newQty     = currentQty + parseFloat(quantity);

      await connection.execute(
        `UPDATE central_raw_materials SET quantity = ? WHERE ingredient_id = ?`,
        [newQty, ingredient_id]
      );

      await recordCentralRMTxn(connection, {
        ingredientId: ingredient_id, txnType: 'stock_in',
        quantity: parseFloat(quantity), balanceAfter: newQty,
        referenceType: 'manual', notes, createdBy: userId,
      });

      await connection.commit();
      logger.info(`[Production] RM stock-in: +${quantity} of ingredient ${ingredient_id}.`);

      return {
        ingredient_id,
        ingredient_name: ingRows[0].name,
        unit:            ingRows[0].unit,
        quantity_added:  parseFloat(quantity),
        new_quantity:    newQty,
      };
    } catch (err) { await connection.rollback(); throw err; }
    finally        { connection.release(); }
  },


  async getRawMaterialLevels(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params     = [];

    if (query.search) { conditions.push('i.name LIKE ?'); params.push(`%${query.search}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ingredients i
         LEFT JOIN central_raw_materials crm ON crm.ingredient_id = i.id ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT i.id AS ingredient_id, i.uuid AS ingredient_uuid,
              i.name, i.unit,
              i.low_stock_threshold, i.critical_stock_threshold,
              COALESCE(crm.quantity, 0) AS quantity, crm.updated_at,
              CASE
                WHEN COALESCE(crm.quantity, 0) <= 0                           THEN 'out_of_stock'
                WHEN COALESCE(crm.quantity, 0) <= i.critical_stock_threshold  THEN 'critical'
                WHEN COALESCE(crm.quantity, 0) <= i.low_stock_threshold       THEN 'low'
                ELSE 'ok'
              END AS stock_level
         FROM ingredients i
         LEFT JOIN central_raw_materials crm ON crm.ingredient_id = i.id
         ${where}
         ORDER BY stock_level ASC, i.name ASC
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`,
      params
    );

    return {
      raw_materials: rows.map((r) => ({
        ingredient: { id: r.ingredient_uuid, name: r.name, unit: r.unit },
        quantity:    parseFloat(r.quantity),
        stock_level: r.stock_level,
        thresholds:  { low: parseFloat(r.low_stock_threshold), critical: parseFloat(r.critical_stock_threshold) },
        updated_at:  r.updated_at || null,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },


  async createBatch(data, userId) {
    const { product_id, quantity_ml, raw_materials, produced_at, notes } = data;

    const [productRows] = await pool.execute(
      `SELECT id, uuid, name, product_type FROM products WHERE id = ? AND is_active = 1 LIMIT 1`,
      [product_id]
    );
    if (!productRows.length)
      throw new AppError('Product not found or inactive.', 404, 'NOT_FOUND');

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const insufficientItems = [];

      const ingredientIds   = raw_materials.map((rm) => rm.ingredient_id);
      const placeholders    = ingredientIds.map(() => '?').join(',');
      const [ingMeta]       = await connection.execute(
        `SELECT id, name, unit FROM ingredients WHERE id IN (${placeholders})`,
        ingredientIds
      );
      const ingMetaMap = new Map(ingMeta.map((i) => [i.id, i]));

      const stockMap = new Map();
      for (const rm of raw_materials) {
        const currentQty = await getOrCreateCentralRM(connection, rm.ingredient_id, true);
        stockMap.set(rm.ingredient_id, currentQty);

        if (currentQty < rm.quantity_used) {
          const meta = ingMetaMap.get(rm.ingredient_id);
          insufficientItems.push({
            ingredient_id: rm.ingredient_id,
            name:          meta?.name || `ID:${rm.ingredient_id}`,
            required:      rm.quantity_used,
            available:     currentQty,
            unit:          meta?.unit || null,
          });
        }
      }

      if (insufficientItems.length > 0) {
        await connection.rollback();
        throw new AppError(
          `Insufficient raw material stock: ${insufficientItems.map((i) =>
            `${i.name} (need ${i.quantity_used} ${i.unit || ''}, have ${i.available})`
          ).join('; ')}`,
          400, 'INSUFFICIENT_STOCK'
        );
      }

      const batchNumber = await generateBatchNumber();
      const [batchResult] = await connection.execute(
        `INSERT INTO production_batches
           (uuid, batch_number, product_id, quantity_ml, produced_at, created_by, notes)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [batchNumber, product_id, quantity_ml, produced_at || new Date(), userId, notes || null]
      );
      const batchId = batchResult.insertId;

      for (const rm of raw_materials) {
        const meta       = ingMetaMap.get(rm.ingredient_id);
        const currentQty = stockMap.get(rm.ingredient_id);
        const newQty     = currentQty - parseFloat(rm.quantity_used);

        await connection.execute(
          `UPDATE central_raw_materials SET quantity = ? WHERE ingredient_id = ?`,
          [newQty, rm.ingredient_id]
        );

        await connection.execute(
          `INSERT INTO production_batch_ingredients
             (batch_id, ingredient_id, quantity_used, unit)
           VALUES (?, ?, ?, ?)`,
          [batchId, rm.ingredient_id, rm.quantity_used, meta?.unit || null]
        );

        await recordCentralRMTxn(connection, {
          ingredientId:  rm.ingredient_id, txnType: 'consumed',
          quantity:      -parseFloat(rm.quantity_used), balanceAfter: newQty,
          referenceType: 'production_batch', referenceId: batchId,
          notes:         `Consumed in batch ${batchNumber}`, createdBy: userId,
        });
      }

      /* Add to central finished inventory */
      const currentFinished = await getOrCreateCentralInventory(
        connection, product_id, true
      );
      const newFinished = currentFinished + parseFloat(quantity_ml);

      await connection.execute(
        `UPDATE central_inventory SET quantity_ml = ? WHERE product_id = ?`,
        [newFinished, product_id]
      );

      await connection.commit();
      logger.info(`[Production] Batch ${batchNumber} created — ${quantity_ml}ml produced.`);
      return productionService.getBatchById(batchId, true);
    } catch (err) { await connection.rollback(); throw err; }
    finally        { connection.release(); }
  },


  async getBatchById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'pb.id' : 'pb.uuid';

    const [batchRows] = await pool.execute(
      `SELECT pb.id, pb.uuid, pb.batch_number, pb.quantity_ml,
              pb.produced_at, pb.notes, pb.created_at,
              p.uuid AS product_uuid, p.name AS product_name, p.product_type,
              u.name AS created_by_name,
              COALESCE(ci.quantity_ml, 0) AS current_central_stock,
              COALESCE(
                (SELECT SUM(dl.quantity_ml) FROM distribution_logs dl WHERE dl.batch_id = pb.id), 0
              ) AS total_distributed_ml
         FROM production_batches pb
         JOIN products p     ON p.id = pb.product_id
         LEFT JOIN users u   ON u.id = pb.created_by
         LEFT JOIN central_inventory ci ON ci.product_id = pb.product_id
         WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!batchRows.length) throw new AppError('Production batch not found.', 404, 'NOT_FOUND');
    const batch = batchRows[0];

    const [ingredients] = await pool.execute(
      `SELECT i.uuid AS ingredient_uuid, i.name, pbi.unit, pbi.quantity_used
         FROM production_batch_ingredients pbi
         JOIN ingredients i ON i.id = pbi.ingredient_id
         WHERE pbi.batch_id = ? ORDER BY i.name ASC`,
      [batch.id]
    );

    const [distributions] = await pool.execute(
      `SELECT dl.uuid, dl.channel, dl.quantity_ml, dl.distributed_at, dl.notes,
              s.name AS store_name, u.name AS distributed_by_name
         FROM distribution_logs dl
         LEFT JOIN stores s ON s.id = dl.destination_store_id
         LEFT JOIN users  u ON u.id = dl.distributed_by
         WHERE dl.batch_id = ? ORDER BY dl.distributed_at DESC`,
      [batch.id]
    );

    return {
      id:                       batch.uuid,
      batch_number:             batch.batch_number,
      product:                  { id: batch.product_uuid, name: batch.product_name, product_type: batch.product_type },
      quantity_produced_ml:     parseFloat(batch.quantity_ml),
      quantity_remaining_ml:    parseFloat(batch.quantity_ml) - parseFloat(batch.total_distributed_ml),
      total_distributed_ml:     parseFloat(batch.total_distributed_ml),
      current_central_stock_ml: parseFloat(batch.current_central_stock),
      raw_materials: ingredients.map((i) => ({
        ingredient:    { id: i.ingredient_uuid, name: i.name, unit: i.unit || null },
        quantity_used: parseFloat(i.quantity_used),
      })),
      distributions: distributions.map((d) => ({
        id:             d.uuid,
        channel:        d.channel,
        store:          d.store_name || null,
        quantity_ml:    parseFloat(d.quantity_ml),
        notes:          d.notes,
        distributed_by: d.distributed_by_name,
        distributed_at: d.distributed_at,
      })),
      created_by:  batch.created_by_name,
      produced_at: batch.produced_at,
      created_at:  batch.created_at,
      notes:       batch.notes,
    };
  },


  async listBatches(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params     = [];

    if (query.product_id) { conditions.push('pb.product_id = ?');     params.push(query.product_id); }
    if (query.date_from)  { conditions.push('pb.produced_at >= ?');    params.push(query.date_from); }
    if (query.date_to)    { conditions.push('pb.produced_at <= ?');    params.push(query.date_to); }
    if (query.search)     { conditions.push('pb.batch_number LIKE ?'); params.push(`%${query.search}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM production_batches pb ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT pb.uuid, pb.batch_number, pb.quantity_ml, pb.produced_at, pb.created_at,
              p.uuid AS product_uuid, p.name AS product_name,
              u.name AS created_by_name,
              COALESCE(
                (SELECT SUM(dl.quantity_ml) FROM distribution_logs dl WHERE dl.batch_id = pb.id), 0
              ) AS total_distributed_ml
         FROM production_batches pb
         JOIN products p   ON p.id = pb.product_id
         LEFT JOIN users u ON u.id = pb.created_by
         ${where}
         ORDER BY pb.produced_at DESC
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`,
      params
    );

    return {
      batches: rows.map((r) => ({
        id:                    r.uuid,
        batch_number:          r.batch_number,
        product:               { id: r.product_uuid, name: r.product_name },
        quantity_produced_ml:  parseFloat(r.quantity_ml),
        total_distributed_ml:  parseFloat(r.total_distributed_ml),
        quantity_remaining_ml: parseFloat(r.quantity_ml) - parseFloat(r.total_distributed_ml),
        created_by:            r.created_by_name,
        produced_at:           r.produced_at,
        created_at:            r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },


  async distribute(data, userId) {
    const { batch_uuid, channel, destination_store_id, quantity_ml, notes } = data;

    const [batchRows] = await pool.execute(
      `SELECT pb.id, pb.uuid, pb.batch_number, pb.product_id, pb.quantity_ml,
              COALESCE(
                (SELECT SUM(dl.quantity_ml) FROM distribution_logs dl WHERE dl.batch_id = pb.id), 0
              ) AS already_distributed
         FROM production_batches pb WHERE pb.uuid = ? LIMIT 1`,
      [batch_uuid]
    );
    if (!batchRows.length) throw new AppError('Production batch not found.', 404, 'NOT_FOUND');
    const batch = batchRows[0];

    const remaining = parseFloat(batch.quantity_ml) - parseFloat(batch.already_distributed);
    if (parseFloat(quantity_ml) > remaining) {
      throw new AppError(
        `Cannot distribute ${quantity_ml}ml — only ${remaining.toFixed(3)}ml remaining in batch ${batch.batch_number}.`,
        400, 'INSUFFICIENT_BATCH_QUANTITY'
      );
    }

    if (destination_store_id) {
      const [storeRows] = await pool.execute(
        'SELECT id FROM stores WHERE id = ? AND is_active = 1 LIMIT 1',
        [destination_store_id]
      );
      if (!storeRows.length) throw new AppError('Destination store not found.', 404, 'NOT_FOUND');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const currentCentral = await getOrCreateCentralInventory(
        connection, batch.product_id, true
      );
      const newCentral = Math.max(0, currentCentral - parseFloat(quantity_ml));

      await connection.execute(
        `UPDATE central_inventory SET quantity_ml = ? WHERE product_id = ?`,
        [newCentral, batch.product_id]
      );

      await connection.execute(
        `INSERT INTO distribution_logs
           (uuid, batch_id, destination_store_id, channel, quantity_ml, notes, distributed_by)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [batch.id, destination_store_id || null, channel, quantity_ml, notes || null, userId]
      );

      await connection.commit();
      logger.info(`[Production] Distributed ${quantity_ml}ml from batch ${batch.batch_number} to ${channel}.`);
      return productionService.getBatchById(batch.id, true);
    } catch (err) { await connection.rollback(); throw err; }
    finally        { connection.release(); }
  },


  async getDistributionLog(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params     = [];

    if (query.batch_id)  { conditions.push('dl.batch_id = ?');              params.push(query.batch_id); }
    if (query.store_id)  { conditions.push('dl.destination_store_id = ?');  params.push(query.store_id); }
    if (query.channel)   { conditions.push('dl.channel = ?');               params.push(query.channel); }
    if (query.date_from) { conditions.push('dl.distributed_at >= ?');       params.push(query.date_from); }
    if (query.date_to)   { conditions.push('dl.distributed_at <= ?');       params.push(query.date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM distribution_logs dl ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT dl.uuid, dl.channel, dl.quantity_ml, dl.distributed_at, dl.notes,
              pb.batch_number, p.name AS product_name,
              s.name AS store_name, u.name AS distributed_by_name
         FROM distribution_logs dl
         JOIN production_batches pb ON pb.id = dl.batch_id
         JOIN products p            ON p.id  = pb.product_id
         LEFT JOIN stores s ON s.id = dl.destination_store_id
         LEFT JOIN users  u ON u.id = dl.distributed_by
         ${where}
         ORDER BY dl.distributed_at DESC
         LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`,
      params
    );

    return {
      logs: rows.map((r) => ({
        id:             r.uuid,
        batch_number:   r.batch_number,
        product_name:   r.product_name,
        channel:        r.channel,
        store:          r.store_name || null,
        quantity_ml:    parseFloat(r.quantity_ml),
        distributed_by: r.distributed_by_name,
        distributed_at: r.distributed_at,
        notes:          r.notes,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },


  async getCentralInventorySummary() {
    const [rows] = await pool.execute(
      `SELECT p.uuid AS product_uuid, p.name AS product_name, p.product_type,
              COALESCE(ci.quantity_ml, 0) AS quantity_ml, ci.updated_at
         FROM products p
         LEFT JOIN central_inventory ci ON ci.product_id = p.id
         WHERE p.is_active = 1 ORDER BY p.name ASC`
    );
    return rows.map((r) => ({
      product:     { id: r.product_uuid, name: r.product_name, product_type: r.product_type },
      quantity_ml: parseFloat(r.quantity_ml || 0),
      updated_at:  r.updated_at || null,
    }));
  },


 
  async runCentralRMThresholdScan() {
    const [rows] = await pool.execute(
      `SELECT crm.ingredient_id, crm.quantity,
              i.name, i.low_stock_threshold, i.critical_stock_threshold
         FROM central_raw_materials crm
         JOIN ingredients i ON i.id = crm.ingredient_id`
    );

    const alerts = [];
    for (const row of rows) {
      const qty = parseFloat(row.quantity);
      let level = null;
      if (qty <= 0)                             level = 'out_of_stock';
      else if (qty <= parseFloat(row.critical_stock_threshold)) level = 'critical';
      else if (qty <= parseFloat(row.low_stock_threshold))      level = 'low';

      if (level) {
        alerts.push({ ingredient: row.name, level, quantity: qty });
        logger.warn(
          `[Production] Central RM alert "${level}" — ${row.name}: ${qty} remaining`
        );
      }
    }

    return { scanned: rows.length, alerts };
  },
};

module.exports = { productionService };