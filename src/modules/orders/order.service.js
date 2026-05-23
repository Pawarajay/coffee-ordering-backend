
'use strict';

const { pool } = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { ingredientMappingService } = require('../ingredients/ingredient.service');
const { ORDER_STATUS, KOT_STATUS } = require('../../config/constants');
const logger = require('../../utils/logger');

function getNotifier() {
  return require('../barista/barista.service').notifyNewOrder;
}
function getInventoryService() {
  return require('../inventory/inventory.service').inventoryService;
}
function getWhatsAppService() {
  return require('../whatsapp/whatsapp.service').whatsappService;
}
function getPaymentService() {
  return require('../payment/payment.service').paymentService;
}

async function generateOrderNumber(storeId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM orders WHERE store_id = ? AND DATE(created_at) = CURDATE()`,
    [storeId]
  );
  const seq = String(rows[0].cnt + 1).padStart(4, '0');
  return `TOOF-${date}-${seq}`;
}

async function generateKOTNumber(storeId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM kots WHERE store_id = ? AND DATE(created_at) = CURDATE()`,
    [storeId]
  );
  const seq = String(rows[0].cnt + 1).padStart(4, '0');
  return `KOT-${date}-${seq}`;
}

const orderService = {

  async create(data, customerId = null) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [storeRows] = await connection.execute(
        'SELECT id, name FROM stores WHERE id = ? AND is_active = 1 LIMIT 1',
        [data.store_id]
      );
      if (!storeRows.length)
        throw new AppError('Store not found or inactive.', 404, 'STORE_NOT_FOUND');

      let subtotal = 0;
      const resolvedItems = [];

      for (const item of data.items) {
        const [productRows] = await connection.execute(
          `SELECT id, uuid, name, base_price, is_customizable, is_active,
                  is_available_kiosk, is_available_d2c
             FROM products WHERE uuid = ? LIMIT 1`,
          [item.product_id]
        );
        if (!productRows.length)
          throw new AppError(`Product ${item.product_id} not found.`, 404, 'PRODUCT_NOT_FOUND');

        const product = productRows[0];
        if (!product.is_active)
          throw new AppError(`Product "${product.name}" is not available.`, 400, 'PRODUCT_UNAVAILABLE');

        let unitPrice       = parseFloat(product.base_price);
        let customizations  = null;
        let customDrinkId   = null;      
        let breakdown       = [];

        const rawCustom = item.customizations;
        if (rawCustom) {
          const ingredients = Array.isArray(rawCustom)
            ? rawCustom
            : rawCustom.ingredients || [];

          if (ingredients.length) {
            if (!product.is_customizable)
              throw new AppError(
                `Product "${product.name}" is not customizable.`, 400, 'NOT_CUSTOMIZABLE'
              );

            const pricing = await ingredientMappingService.calculatePrice(
              product.id,
              ingredients
            );
            unitPrice  = pricing.total_price;
            breakdown  = pricing.breakdown;

        
            const incomingCustomDrinkId = !Array.isArray(rawCustom)
              ? rawCustom.custom_drink_id || null
              : null;

            if (incomingCustomDrinkId && customerId) {
              const [cdRows] = await connection.execute(
                `SELECT id FROM custom_drinks
                   WHERE uuid = ? AND customer_id = ? AND is_active = 1 LIMIT 1`,
                [incomingCustomDrinkId, customerId]
              );
              if (!cdRows.length)
                throw new AppError(
                  'Custom drink not found or does not belong to this customer.',
                  404, 'CUSTOM_DRINK_NOT_FOUND'
                );
              customDrinkId = cdRows[0].id;
            }

            customizations = {
              name:        !Array.isArray(rawCustom) ? (rawCustom.name || null) : null,
              ingredients: breakdown,
            };
          }
        }

        const lineTotal = parseFloat((unitPrice * item.quantity).toFixed(2));
        subtotal += lineTotal;

        resolvedItems.push({
          productId:          product.id,
          productName:        product.name,
          customDrinkId,                 
          quantity:           item.quantity,
          unitPrice,
          lineTotal,
          notes:              item.notes || null,
          customizations,
          ingredientBreakdown: breakdown,
        });
      }

  
      const discountAmount = Math.min(
        parseFloat((data.discount_amount || 0).toFixed(2)),
        subtotal
      );
      const discountedSubtotal = parseFloat((subtotal - discountAmount).toFixed(2));

      const TAX_RATE  = 0.18;
      const taxAmount = parseFloat((discountedSubtotal * TAX_RATE).toFixed(2));
      const totalAmount = parseFloat((discountedSubtotal + taxAmount).toFixed(2));

      const orderNumber = await generateOrderNumber(data.store_id);
      const [orderResult] = await connection.execute(
        `INSERT INTO orders
           (uuid, order_number, store_id, customer_id, channel, status,
            subtotal, discount_amount, tax_amount, total_amount, notes,
            is_synced_to_accounting)
         VALUES (UUID(), ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 0)`,
        [
          orderNumber, data.store_id, customerId || null, data.channel,
          subtotal, discountAmount, taxAmount, totalAmount,
          data.notes || null,
        ]
      );
      const orderId = orderResult.insertId;

      for (const item of resolvedItems) {
        const [itemResult] = await connection.execute(
          `INSERT INTO order_items
             (order_id, product_id, custom_drink_id, quantity,
              unit_price, total_price, item_name, notes, customizations)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId, item.productId, item.customDrinkId,  
            item.quantity, item.unitPrice, item.lineTotal,
            item.productName, item.notes,
            item.customizations ? JSON.stringify(item.customizations) : null,
          ]
        );
        const orderItemId = itemResult.insertId;

        for (const ing of item.ingredientBreakdown) {
          await connection.execute(
            `INSERT INTO order_item_ingredients
               (order_item_id, ingredient_id, quantity, unit_price, total_price)
             VALUES (?, ?, ?, ?, ?)`,
            [orderItemId, ing.ingredient_id, ing.quantity, ing.unit_price, ing.line_price]
          );
        }
      }

      const kotNumber = await generateKOTNumber(data.store_id);
      await connection.execute(
        `INSERT INTO kots (uuid, kot_number, order_id, store_id, status)
         VALUES (UUID(), ?, ?, ?, 'open')`,
        [kotNumber, orderId, data.store_id]
      );

      await connection.execute(
        `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
         VALUES (?, NULL, 'pending', ?)`,
        [orderId, customerId || null]
      );

      await connection.commit();
      logger.info(`[Order] Created ${orderNumber} — total ₹${totalAmount}`);

      const createdOrder = await orderService.getById(orderId, true);

      try {
        getNotifier()(data.store_id, {
          order_uuid:   createdOrder.id,
          order_number: createdOrder.order_number,
          channel:      createdOrder.channel,
          total_amount: createdOrder.financials.total_amount,
          item_count:   data.items.length,
          kot_number:   createdOrder.kot?.number,
        });
      } catch (wsErr) {
        logger.warn('[Order] WS notify failed (non-fatal):', wsErr.message);
      }

      try {
        await getWhatsAppService().sendOrderConfirmation(createdOrder);
      } catch (waErr) {
        logger.warn('[Order] WhatsApp confirmation failed (non-fatal):', waErr.message);
      }

      return createdOrder;

    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async initiatePayment(orderUuid, paymentData) {
    const [rows] = await pool.execute(
      'SELECT id, total_amount, status FROM orders WHERE uuid = ? LIMIT 1',
      [orderUuid]
    );
    if (!rows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = rows[0];

    if (order.status === ORDER_STATUS.CANCELLED)
      throw new AppError('Cannot initiate payment for a cancelled order.', 400, 'ORDER_CANCELLED');

    const [existing] = await pool.execute(
      `SELECT id FROM payments WHERE order_id = ? AND status = 'success' LIMIT 1`,
      [order.id]
    );
    if (existing.length)
      throw new AppError('Order is already paid.', 409, 'ALREADY_PAID');

    const gatewayOrder = await getPaymentService().createGatewayOrder({
      amount:      order.total_amount,
      currency:    'INR',
      receipt:     orderUuid,
      method:      paymentData.method,
    });

    await pool.execute(
      `INSERT INTO payments
         (uuid, order_id, amount, method, status, gateway_provider, gateway_order_id)
       VALUES (UUID(), ?, ?, ?, 'pending', 'razorpay', ?)
       ON DUPLICATE KEY UPDATE gateway_order_id = VALUES(gateway_order_id)`,
      [order.id, order.total_amount, paymentData.method, gatewayOrder.id]
    );

    return {
      gateway_order_id: gatewayOrder.id,
      amount:           order.total_amount,
      currency:         'INR',
      key:              gatewayOrder.key,       
    };
  },

  async recordPayment(orderUuid, paymentData, recordedBy) {
    const [rows] = await pool.execute(
      'SELECT id, total_amount, status FROM orders WHERE uuid = ? LIMIT 1',
      [orderUuid]
    );
    if (!rows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = rows[0];

    if (order.status === ORDER_STATUS.CANCELLED)
      throw new AppError('Cannot record payment for a cancelled order.', 400, 'ORDER_CANCELLED');

    const [existing] = await pool.execute(
      `SELECT id FROM payments WHERE order_id = ? AND status = 'success' LIMIT 1`,
      [order.id]
    );
    if (existing.length)
      throw new AppError('Payment already recorded for this order.', 409, 'PAYMENT_ALREADY_EXISTS');

    await getPaymentService().verifySignature({
      gateway_order_id:   paymentData.gateway_order_id,
      gateway_payment_id: paymentData.gateway_payment_id,
      gateway_signature:  paymentData.gateway_signature,
    });

    await pool.execute(
      `INSERT INTO payments
         (uuid, order_id, amount, method, status, gateway_provider,
          gateway_order_id, gateway_payment_id, gateway_signature)
       VALUES (UUID(), ?, ?, ?, 'success', 'razorpay', ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = 'success',
         gateway_payment_id = VALUES(gateway_payment_id),
         gateway_signature  = VALUES(gateway_signature)`,
      [
        order.id, paymentData.amount, paymentData.method,
        paymentData.gateway_order_id   || null,
        paymentData.gateway_payment_id || null,
        paymentData.gateway_signature  || null,
      ]
    );

    if (order.status === ORDER_STATUS.PENDING) {
      await orderService.updateStatus(orderUuid, ORDER_STATUS.CONFIRMED, recordedBy,
        'Auto-confirmed on payment');

      try {
        await getInventoryService().deductForOrder(order.id, null, recordedBy);
      } catch (invErr) {
        logger.warn('[Order] Inventory deduction failed (non-fatal):', invErr.message);
      }
    }

    return orderService.getById(orderUuid);
  },

  async getById(id, byPrimaryKey = false) {
    const col = byPrimaryKey ? 'o.id' : 'o.uuid';

    const [orderRows] = await pool.execute(
      `SELECT o.id, o.uuid, o.order_number, o.channel, o.status,
              o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
              o.notes, o.is_synced_to_accounting,
              o.confirmed_at, o.in_progress_at, o.ready_at,
              o.completed_at, o.cancelled_at, o.created_at, o.updated_at,
              s.id AS store_id, s.name AS store_name,
              u.uuid AS customer_uuid, u.name AS customer_name, u.mobile AS customer_mobile,
              k.uuid AS kot_uuid, k.kot_number, k.status AS kot_status
         FROM orders o
         JOIN stores s  ON s.id = o.store_id
         LEFT JOIN users u ON u.id = o.customer_id
         LEFT JOIN kots k  ON k.order_id = o.id
         WHERE ${col} = ? LIMIT 1`,
      [id]
    );
    if (!orderRows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = orderRows[0];

    const [items] = await pool.execute(
      `SELECT oi.id, oi.quantity, oi.unit_price, oi.total_price,
              oi.item_name, oi.notes, oi.customizations,
              p.uuid AS product_uuid,
              cd.uuid AS custom_drink_uuid, cd.name AS custom_drink_name
         FROM order_items oi
         JOIN products p       ON p.id  = oi.product_id
         LEFT JOIN custom_drinks cd ON cd.id = oi.custom_drink_id
         WHERE oi.order_id = ?`,
      [order.id]
    );

  
    let kotItems = [];
    if (order.kot_uuid) {
      const [kotRows] = await pool.execute(
        `SELECT oi.item_name, oi.quantity, oi.notes, oi.customizations,
                p.uuid AS product_uuid
           FROM kots k
           JOIN orders o2     ON o2.id = k.order_id
           JOIN order_items oi ON oi.order_id = o2.id
           JOIN products p     ON p.id = oi.product_id
           WHERE k.uuid = ?`,
        [order.kot_uuid]
      );
      kotItems = kotRows.map((r) => ({
        product_id:     r.product_uuid,
        name:           r.item_name,
        quantity:       r.quantity,
        notes:          r.notes || null,
        preparation:    r.customizations
          ? (JSON.parse(r.customizations).ingredients || []).map((ing) => ({
              ingredient: ing.name,
              quantity:   ing.quantity,
              unit:       ing.unit || null,
            }))
          : [],
      }));
    }

    return formatOrder(order, items, kotItems);
  },

  async getList(query, requester) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params = [];

    if (requester.role === 'barista' || requester.role === 'store_manager') {
      conditions.push('o.store_id = ?');
      params.push(requester.storeId);
    } else if (query.store_id) {
      conditions.push('o.store_id = ?');
      params.push(query.store_id);
    }

    if (query.status)               { conditions.push('o.status = ?');                 params.push(query.status); }
    if (query.channel)              { conditions.push('o.channel = ?');                params.push(query.channel); }
    if (query.date_from)            { conditions.push('o.created_at >= ?');            params.push(query.date_from); }
    if (query.date_to)              { conditions.push('o.created_at <= ?');            params.push(query.date_to); }
    if (query.is_synced_to_accounting !== undefined) {
      conditions.push('o.is_synced_to_accounting = ?');
      params.push(query.is_synced_to_accounting === 'true' ? 1 : 0);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT o.id, o.uuid, o.order_number, o.channel, o.status,
              o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
              o.is_synced_to_accounting, o.created_at,
              s.name AS store_name,
              u.name AS customer_name, u.mobile AS customer_mobile
         FROM orders o
         JOIN stores s   ON s.id = o.store_id
         LEFT JOIN users u ON u.id = o.customer_id
         ${where}
         ORDER BY o.created_at DESC
         LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    return {
      orders: rows.map(formatOrderSummary),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async updateStatus(uuid, newStatus, changedBy, notes = null) {
    const order = await orderService.getById(uuid);

    const allowedTransitions = {
      pending:     ['confirmed', 'cancelled'],
      confirmed:   ['in_progress', 'cancelled'],
      in_progress: ['ready', 'cancelled'],
      ready:       ['completed'],
      completed:   [],
      cancelled:   [],
      refunded:    [],
    };

    if (!allowedTransitions[order.status]?.includes(newStatus)) {
      throw new AppError(
        `Cannot transition from "${order.status}" to "${newStatus}".`,
        400, 'INVALID_STATUS_TRANSITION'
      );
    }

    const timestampField = {
      confirmed:   'confirmed_at',
      in_progress: 'in_progress_at',
      ready:       'ready_at',
      completed:   'completed_at',
      cancelled:   'cancelled_at',
    }[newStatus];

    const setClause = timestampField
      ? `status = ?, ${timestampField} = NOW()`
      : 'status = ?';

    await pool.execute(
      `UPDATE orders SET ${setClause} WHERE uuid = ?`,
      [newStatus, uuid]
    );
    await pool.execute(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, notes)
       SELECT id, ?, ?, ?, ? FROM orders WHERE uuid = ?`,
      [order.status, newStatus, changedBy, notes, uuid]
    );

    const kotStatusMap = {
      in_progress: KOT_STATUS.IN_PROGRESS,
      completed:   KOT_STATUS.DONE,
      cancelled:   KOT_STATUS.CANCELLED,
    };
    if (kotStatusMap[newStatus]) {
      await pool.execute(
        `UPDATE kots SET status = ? WHERE order_id =
         (SELECT id FROM orders WHERE uuid = ?)`,
        [kotStatusMap[newStatus], uuid]
      );
    }

    logger.info(`[Order] ${order.order_number} → ${newStatus} by user ${changedBy}`);
    const updatedOrder = await orderService.getById(uuid);

    /* WhatsApp — completion notification + feedback request (non-fatal) */
    if (newStatus === ORDER_STATUS.READY || newStatus === ORDER_STATUS.COMPLETED) {
      try {
        await getWhatsAppService().sendOrderReady(updatedOrder);
      } catch (waErr) {
        logger.warn('[Order] WhatsApp ready/completed notify failed (non-fatal):', waErr.message);
      }
    }

    return updatedOrder;
  },

  /* ── Customer cancel ────────────────────────────────────────────────────── */
  async cancelByCustomer(uuid, customerId, reason) {
    const [rows] = await pool.execute(
      'SELECT id, status, customer_id FROM orders WHERE uuid = ? LIMIT 1', [uuid]
    );
    if (!rows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = rows[0];

    if (order.customer_id !== customerId)
      throw new AppError('You can only cancel your own orders.', 403, 'FORBIDDEN');

    if (!['pending', 'confirmed'].includes(order.status))
      throw new AppError(
        'Order cannot be cancelled at this stage. Please contact staff.',
        400, 'CANCEL_NOT_ALLOWED'
      );

    return orderService.updateStatus(uuid, ORDER_STATUS.CANCELLED, customerId,
      reason || 'Cancelled by customer');
  },

  async discardAndReorder(uuid, customerId) {
    const [rows] = await pool.execute(
      `SELECT o.id, o.uuid, o.status, o.customer_id, o.store_id, o.channel, o.notes
         FROM orders o WHERE o.uuid = ? LIMIT 1`,
      [uuid]
    );
    if (!rows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = rows[0];

    if (order.customer_id !== customerId)
      throw new AppError('You can only discard your own orders.', 403, 'FORBIDDEN');

    if (!['pending', 'confirmed'].includes(order.status))
      throw new AppError(
        'Only pending or confirmed orders can be discarded.',
        400, 'DISCARD_NOT_ALLOWED'
      );

    const [discardRows] = await pool.execute(
      `SELECT COUNT(*) AS cnt
         FROM order_status_history
         WHERE changed_by = ?
           AND notes = 'Discarded by customer'
           AND DATE(created_at) = CURDATE()`,
      [customerId]
    );
    if (discardRows[0].cnt >= 1)
      throw new AppError(
        'You have already used your free discard for today. Please contact staff for further changes.',
        403, 'DISCARD_LIMIT_REACHED'
      );

    await orderService.updateStatus(uuid, ORDER_STATUS.CANCELLED, customerId,
      'Discarded by customer');

    const [items] = await pool.execute(
      `SELECT oi.quantity, oi.unit_price, oi.notes, oi.customizations,
              oi.custom_drink_id,
              p.uuid AS product_uuid
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
      [order.id]
    );

    return {
      message: 'Order discarded. Your cart has been restored — place a new order to confirm.',
      draft_cart: {
        store_id: order.store_id,
        channel:  order.channel,
        notes:    order.notes,
        items: items.map((i) => ({
          product_id:     i.product_uuid,
          quantity:       i.quantity,
          notes:          i.notes || null,
          customizations: i.customizations ? JSON.parse(i.customizations) : null,
        })),
      },
    };
  },

  async getOrderHistory(customerId, query) {
    const { page, limit, offset } = parsePagination(query);

    const [countRows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?', [customerId]
    );
    const [rows] = await pool.query(
      `SELECT o.uuid, o.order_number, o.status, o.total_amount,
              o.channel, o.created_at,
              s.name AS store_name
         FROM orders o
         JOIN stores s ON s.id = o.store_id
         WHERE o.customer_id = ?
         ORDER BY o.created_at DESC
         LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      [customerId]
    );

    return {
      orders: rows.map(formatOrderSummary),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async markAccountingSynced(orderUuids) {
    if (!orderUuids?.length)
      throw new AppError('No order IDs provided.', 400, 'MISSING_IDS');

    const placeholders = orderUuids.map(() => '?').join(',');
    const [result] = await pool.execute(
      `UPDATE orders
         SET is_synced_to_accounting = 1, accounting_synced_at = NOW()
         WHERE uuid IN (${placeholders})`,
      orderUuids
    );

    return { synced_count: result.affectedRows };
  },

  async getUnsyncedForAccounting(query) {
    const { page, limit, offset } = parsePagination(query);

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders
         WHERE is_synced_to_accounting = 0 AND status = 'completed'`
    );
    const [rows] = await pool.query(
      `SELECT o.uuid, o.order_number, o.channel, o.status,
              o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
              o.created_at, o.completed_at,
              s.name AS store_name,
              u.name AS customer_name, u.mobile AS customer_mobile
         FROM orders o
         JOIN stores s   ON s.id = o.store_id
         LEFT JOIN users u ON u.id = o.customer_id
         WHERE o.is_synced_to_accounting = 0 AND o.status = 'completed'
         ORDER BY o.created_at ASC
         LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`
    );

    return {
      orders: rows.map(formatOrderSummary),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },
};

function formatOrder(order, items, kotItems = []) {
  return {
    id:           order.uuid,
    order_number: order.order_number,
    channel:      order.channel,
    status:       order.status,
    store: {
      id:   order.store_id,
      name: order.store_name,
    },
    customer: order.customer_uuid
      ? {
          id:     order.customer_uuid,
          name:   order.customer_name,
          mobile: order.customer_mobile,
        }
      : null,
    financials: {
      subtotal:        parseFloat(order.subtotal),
      discount_amount: parseFloat(order.discount_amount),
      tax_amount:      parseFloat(order.tax_amount),
      total_amount:    parseFloat(order.total_amount),
    },
    items: items.map((i) => ({
      product_id:        i.product_uuid,
      name:              i.item_name,
      quantity:          i.quantity,
      unit_price:        parseFloat(i.unit_price),
      total_price:       parseFloat(i.total_price),
      notes:             i.notes,
      custom_drink:      i.custom_drink_uuid
        ? { id: i.custom_drink_uuid, name: i.custom_drink_name }
        : null,
      customizations:    i.customizations || null,
    })),
    kot: order.kot_uuid
      ? {
          id:     order.kot_uuid,
          number: order.kot_number,
          status: order.kot_status,
          items:  kotItems,             
        }
      : null,
    notes:                   order.notes,
    is_synced_to_accounting: Boolean(order.is_synced_to_accounting),
    timestamps: {
      created_at:     order.created_at,
      confirmed_at:   order.confirmed_at,
      in_progress_at: order.in_progress_at,
      ready_at:       order.ready_at,
      completed_at:   order.completed_at,
      cancelled_at:   order.cancelled_at,
    },
  };
}

function formatOrderSummary(row) {
  return {
    id:                      row.uuid,
    order_number:            row.order_number,
    status:                  row.status,
    channel:                 row.channel,
    store_name:              row.store_name,
    customer:                row.customer_mobile
      ? { name: row.customer_name, mobile: row.customer_mobile }
      : null,
    subtotal:                parseFloat(row.subtotal || 0),
    discount_amount:         parseFloat(row.discount_amount || 0),
    tax_amount:              parseFloat(row.tax_amount || 0),
    total_amount:            parseFloat(row.total_amount),
    is_synced_to_accounting: Boolean(row.is_synced_to_accounting),
    created_at:              row.created_at,
  };
}

module.exports = { orderService };