

'use strict';

const { pool }         = require('../../config/db');
const { AppError }     = require('../../middlewares/error.middleware');
const { orderService } = require('../orders/order.service');
const logger           = require('../../utils/logger');

const reorderService = {

  
  async reorderFromPastOrder(originalOrderUuid, customerId, storeId, channel) {

    const [orderRows] = await pool.execute(
      `SELECT o.id, o.store_id, o.customer_id, o.status
         FROM orders o WHERE o.uuid = ? LIMIT 1`,
      [originalOrderUuid]
    );
    if (!orderRows.length)
      throw new AppError('Original order not found.', 404, 'NOT_FOUND');

    const originalOrder = orderRows[0];
    if (originalOrder.customer_id !== customerId)
      throw new AppError('You can only reorder from your own orders.', 403, 'FORBIDDEN');

    /* 2. Fetch items */
    const [items] = await pool.execute(
      `SELECT
         oi.quantity, oi.notes, oi.customizations,
         p.uuid AS product_uuid, p.name AS product_name,
         p.is_active, p.is_available_kiosk, p.is_available_d2c
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [originalOrder.id]
    );
    if (!items.length)
      throw new AppError('Original order has no items.', 400, 'EMPTY_ORDER');

    const skipped  = [];
    const newItems = [];

    for (const item of items) {
      if (!item.is_active) {
        skipped.push({ product: item.product_name, reason: 'Product no longer available' });
        continue;
      }
      if (channel === 'kiosk' && !item.is_available_kiosk) {
        skipped.push({ product: item.product_name, reason: 'Not available at kiosk' });
        continue;
      }
      if (channel === 'd2c_website' && !item.is_available_d2c) {
        skipped.push({ product: item.product_name, reason: 'Not available on D2C website' });
        continue;
      }

      let customizations = null;
      if (item.customizations) {
        const parsed = typeof item.customizations === 'string'
          ? JSON.parse(item.customizations) : item.customizations;
        if (parsed?.ingredients?.length) {
          customizations = {
            name:        parsed.name || null,
            ingredients: parsed.ingredients.map((ing) => ({
              ingredient_id: ing.ingredient_id,
              quantity:      ing.quantity,
            })),
          };
        }
      }

      newItems.push({
        product_id:     item.product_uuid,
        quantity:       item.quantity,
        notes:          item.notes || null,
        customizations,
      });
    }

    if (!newItems.length)
      throw new AppError(
        'None of the items from the original order are currently available.',
        400, 'NO_AVAILABLE_ITEMS'
      );

    const newOrder = await orderService.create(
      { store_id: storeId, channel, items: newItems },
      customerId
    );

    let paymentInit = null;
    try {
      paymentInit = await orderService.initiatePayment(newOrder.id, { method: 'upi' });
    } catch (payErr) {
      logger.warn(`[Reorder] Payment initiation non-fatal: ${payErr.message}`);
    }

    logger.info(
      `[Reorder] Customer ${customerId} reordered from ${originalOrderUuid}. ` +
      `New: ${newOrder.order_number}. Skipped: ${skipped.length}.`
    );

    return { order: newOrder, payment_init: paymentInit, skipped };
  },

  async reorderFromCustomDrink(drinkUuid, customerId, storeId, channel) {

    /* 1. Fetch drink header */
    const [drinkRows] = await pool.execute(
      `SELECT
         cd.id, cd.uuid, cd.name AS drink_name,
         cd.customer_id, cd.is_active,
         p.uuid AS product_uuid, p.name AS product_name,
         p.is_active AS product_active,
         p.is_available_kiosk, p.is_available_d2c,
         p.is_customizable
       FROM custom_drinks cd
       JOIN products p ON p.id = cd.base_product_id
       WHERE cd.uuid = ? LIMIT 1`,
      [drinkUuid]
    );
    if (!drinkRows.length)
      throw new AppError('Custom drink not found.', 404, 'NOT_FOUND');

    const drink = drinkRows[0];

    /* 2. Validations */
    if (drink.customer_id !== customerId)
      throw new AppError('You can only reorder your own saved drinks.', 403, 'FORBIDDEN');
    if (!drink.is_active)
      throw new AppError(`"${drink.drink_name}" has been deleted.`, 400, 'DRINK_INACTIVE');
    if (!drink.product_active)
      throw new AppError(
        `The base product for "${drink.drink_name}" is no longer available.`,
        400, 'PRODUCT_UNAVAILABLE'
      );
    if (!drink.is_customizable)
      throw new AppError('This product no longer supports customization.', 400, 'NOT_CUSTOMIZABLE');
    if (channel === 'kiosk' && !drink.is_available_kiosk)
      throw new AppError('This drink is not available at the kiosk.', 400, 'CHANNEL_UNAVAILABLE');
    if (channel === 'd2c_website' && !drink.is_available_d2c)
      throw new AppError('This drink is not available on the D2C website.', 400, 'CHANNEL_UNAVAILABLE');

    const [ingredientRows] = await pool.execute(
      `SELECT cdi.ingredient_id, cdi.quantity
         FROM custom_drink_ingredients cdi
         JOIN custom_drinks cd ON cd.id = cdi.custom_drink_id
         WHERE cd.uuid = ?
         ORDER BY cdi.id ASC`,
      [drinkUuid]
    );
    if (!ingredientRows.length)
      throw new AppError('This saved drink has no ingredient data.', 400, 'EMPTY_DRINK');

    const newOrder = await orderService.create(
      {
        store_id: storeId,
        channel,
        notes: `Reorder of saved drink: ${drink.drink_name}`,
        items: [{
          product_id: drink.product_uuid,
          quantity:   1,
          customizations: {
            custom_drink_id: drink.uuid,
            name:            drink.drink_name,
            ingredients:     ingredientRows.map((i) => ({
              ingredient_id: i.ingredient_id,
              quantity:      parseFloat(i.quantity),
            })),
          },
        }],
      },
      customerId
    );

    await pool.execute(
      'UPDATE custom_drinks SET order_count = order_count + 1 WHERE id = ?',
      [drink.id]
    );

    let paymentInit = null;
    try {
      paymentInit = await orderService.initiatePayment(newOrder.id, { method: 'upi' });
    } catch (payErr) {
      logger.warn(`[Reorder] Payment initiation non-fatal: ${payErr.message}`);
    }

    logger.info(
      `[Reorder] Customer ${customerId} reordered "${drink.drink_name}". ` +
      `New order: ${newOrder.order_number}`
    );

    return { order: newOrder, payment_init: paymentInit };
  },
};

module.exports = { reorderService };