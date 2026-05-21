


'use strict';

const { pool }         = require('../../config/db');
const { broadcast, WS_EVENTS } = require('../../websocket/wsServer');
const { kotService }   = require('../kot/kot.service');
const { orderService } = require('../orders/order.service');
const logger           = require('../../utils/logger');

const baristaService = {


  async getQueue(storeId, options = {}) {
    const { include_done_minutes = 0 } = options;

    const conditions = ['k.store_id = ?', "DATE(k.created_at) = CURDATE()"];
    const params     = [storeId];

    if (include_done_minutes > 0) {
      conditions.push(
        `(k.status IN ('open','in_progress') OR
          (k.status = 'done' AND k.completed_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)))`
      );
      params.push(include_done_minutes);
    } else {
      conditions.push("k.status IN ('open','in_progress')");
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.execute(
      `SELECT
         k.uuid  AS kot_uuid,  k.kot_number, k.status AS kot_status,
         k.printed_at, k.started_at, k.created_at,
         o.uuid  AS order_uuid, o.order_number, o.channel,
         o.status AS order_status, o.notes AS order_notes, o.total_amount,
         u.name  AS customer_name, u.mobile AS customer_mobile,
         b.name  AS barista_name,
         TIMESTAMPDIFF(SECOND, k.created_at, NOW()) AS waiting_seconds
       FROM kots k
       JOIN orders o    ON o.id  = k.order_id
       LEFT JOIN users u ON u.id = o.customer_id
       LEFT JOIN users b ON b.id = k.barista_id
       ${where}
       ORDER BY
         CASE k.status
           WHEN 'open'        THEN 1
           WHEN 'in_progress' THEN 2
           ELSE 3
         END ASC,
         k.created_at ASC`,
      params
    );

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const [items] = await pool.execute(
          `SELECT
             oi.id         AS item_id,
             oi.item_name, oi.quantity,
             oi.notes      AS item_notes,
             oi.customizations,
             p.uuid        AS product_uuid
           FROM order_items oi
           JOIN products p ON p.id = oi.product_id
           WHERE oi.order_id = (SELECT id FROM orders WHERE uuid = ?)
           ORDER BY oi.id ASC`,
          [row.order_uuid]
        );

        const enrichedItems = await Promise.all(
          items.map(async (item) => {
            /* Ingredient breakdown + preparation steps — mirrors kotService.getById() */
            const [ingredients] = await pool.execute(
              `SELECT
                 i.name              AS ingredient_name,
                 i.unit,
                 i.preparation_notes,
                 oii.quantity
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
              } catch (_) {}
            }

            /*
             * preparation_steps — step-by-step beverage workflow guidance.
             * SOW §2: "Beverage preparation workflow guidance"
             * SOW §4: Barista interface needs this without a second request.
             * Same logic as kotService.getById() so both screens stay in sync.
             */
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
              name:              item.item_name,
              quantity:          item.quantity,
              notes:             item.item_notes || null,
              custom_name:       parsedCustom?.name || null,
              ingredients:       ingredients.map((ing) => ({
                name:     ing.ingredient_name,
                quantity: parseFloat(ing.quantity),
                unit:     ing.unit || null,
              })),
              preparation_steps,
            };
          })
        );

        return {
          kot: {
            id:              row.kot_uuid,
            kot_number:      row.kot_number,
            status:          row.kot_status,
            is_printed:      Boolean(row.printed_at),
            barista:         row.barista_name   || null,
            waiting_seconds: row.waiting_seconds,
            started_at:      row.started_at     || null,
            created_at:      row.created_at,
          },
          order: {
            id:           row.order_uuid,
            order_number: row.order_number,
            channel:      row.channel,
            status:       row.order_status,
            notes:        row.order_notes,
            total_amount: parseFloat(row.total_amount),
            customer:     row.customer_mobile
              ? { name: row.customer_name, mobile: row.customer_mobile }
              : null,
          },
          items: enrichedItems,
        };
      })
    );

    return {
      store_id: storeId,
      queue:    enriched,
      counts: {
        open:        enriched.filter((e) => e.kot.status === 'open').length,
        in_progress: enriched.filter((e) => e.kot.status === 'in_progress').length,
      },
    };
  },

  /* Barista accepts KOT → in_progress */
  async acceptKOT(kotUuid, baristaId, storeId) {
    const kot = await kotService.updateStatus(kotUuid, 'in_progress', baristaId);

    broadcast(storeId, WS_EVENTS.KOT_UPDATE, {
      kot_uuid:   kotUuid,
      kot_number: kot.kot_number,
      status:     'in_progress',
      barista:    kot.barista,
    });

    logger.info(`[Barista] KOT ${kotUuid} accepted by barista ${baristaId}`);
    return kot;
  },

  /* Barista marks drink ready → KOT done, order → ready */
  async completeKOT(kotUuid, baristaId, storeId) {
    const kot = await kotService.updateStatus(kotUuid, 'done', baristaId);

    broadcast(storeId, WS_EVENTS.KOT_UPDATE, {
      kot_uuid:     kotUuid,
      kot_number:   kot.kot_number,
      status:       'done',
      order_id:     kot.order.id,
      order_number: kot.order.order_number,
    });

    broadcast(storeId, WS_EVENTS.ORDER_STATUS, {
      order_uuid:   kot.order.id,
      order_number: kot.order.order_number,
      status:       'ready',
    });

    logger.info(`[Barista] KOT ${kotUuid} completed by barista ${baristaId}`);
    return kot;
  },

  /* Barista hands order to customer → completed */
  async completeOrder(orderUuid, baristaId, storeId) {
    const order = await orderService.updateStatus(orderUuid, 'completed', baristaId);

    broadcast(storeId, WS_EVENTS.ORDER_STATUS, {
      order_uuid:   orderUuid,
      order_number: order.order_number,
      status:       'completed',
    });

    logger.info(`[Barista] Order ${orderUuid} handed over by barista ${baristaId}`);
    return order;
  },

  /**
   * Barista cancels an order — e.g., ingredient unavailable mid-preparation.
   * SOW §4 — Order status management includes Cancelled state.
   * Delegates to orderService so KOT sync, history, and WhatsApp all fire.
   */
  async cancelOrder(orderUuid, baristaId, storeId, reason) {
    const order = await orderService.updateStatus(
      orderUuid,
      'cancelled',
      baristaId,
      reason || 'Cancelled by barista'
    );

    broadcast(storeId, WS_EVENTS.ORDER_STATUS, {
      order_uuid:   orderUuid,
      order_number: order.order_number,
      status:       'cancelled',
      reason:       reason || null,
    });

    logger.info(`[Barista] Order ${orderUuid} cancelled by barista ${baristaId}. Reason: ${reason || 'none'}`);
    return order;
  },
};

/* ─── Standalone WS notifiers (called from other services) ──────────────── */

/**
 * Broadcast NEW_ORDER to all barista connections in the store.
 * Called by order.service.create() via lazy loader.
 */
function notifyNewOrder(storeId, orderSummary) {
  broadcast(storeId, WS_EVENTS.NEW_ORDER, orderSummary);
}

/**
 * Broadcast KOT_UPDATE (status changed) to all barista connections.
 * Called by kot.service.updateStatus() via lazy loader.
 * FIX: was missing — caused a runtime throw whenever any KOT status changed.
 */
function notifyKotStatusChange(storeId, payload) {
  const targetStore = storeId || payload?.store_id;
  broadcast(targetStore, WS_EVENTS.KOT_UPDATE, payload);
}

module.exports = { baristaService, notifyNewOrder, notifyKotStatusChange };