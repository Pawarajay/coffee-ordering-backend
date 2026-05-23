
'use strict';

const { pool } = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const logger = require('../../utils/logger');

const TAX_RATE = 0.18;

async function generateKOTNumber(storeId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM kots WHERE store_id = ? AND DATE(created_at) = CURDATE()`,
    [storeId]
  );
  const seq = String(rows[0].cnt + 1).padStart(4, '0');
  return `KOT-${date}-${seq}`;
}

async function calculatePrice(ingredients) {
  if (!ingredients.length) return 0;

  const ids = ingredients.map((i) => i.ingredient_id);
  const placeholders = ids.map(() => '?').join(', ');

  const [rows] = await pool.execute(
    `SELECT id, cost_per_unit FROM ingredients WHERE id IN (${placeholders}) AND is_active = 1`,
    ids
  );

  const costMap = {};
  rows.forEach((r) => { costMap[r.id] = parseFloat(r.cost_per_unit); });

  let total = 0;
  for (const ing of ingredients) {
    const cost = costMap[ing.ingredient_id];
    if (cost === undefined) {
      throw new AppError(`Ingredient ${ing.ingredient_id} not found or inactive.`, 400, 'INGREDIENT_NOT_FOUND');
    }
    total += cost * ing.quantity;
  }

  return Math.round(total * 100) / 100;
}

// ─── Validate ingredients against product mappings (NEW) ─────────────────────
async function validateIngredientsForProduct(productId, ingredients) {
  for (const ing of ingredients) {
    const [rows] = await pool.execute(
      `SELECT id FROM ingredient_mappings
         WHERE product_id = ? AND ingredient_id = ? LIMIT 1`,
      [productId, ing.ingredient_id]
    );
    if (!rows.length) {
      throw new AppError(
        `Ingredient ID ${ing.ingredient_id} is not valid for this product.`,
        400,
        'INVALID_INGREDIENT'
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /custom-drinks
 * Save a new custom drink.
 * Now validates ingredients against product mappings.
 */
async function createCustomDrink(customerId, data) {
  const { base_product_id, name, ingredients } = data;

  // Validate base product exists and is customizable
  const [products] = await pool.execute(
    `SELECT id, name, is_customizable, is_active FROM products WHERE id = ? LIMIT 1`,
    [base_product_id]
  );

  if (!products.length || !products[0].is_active) {
    throw new AppError('Base product not found.', 404, 'PRODUCT_NOT_FOUND');
  }

  if (!products[0].is_customizable) {
    throw new AppError('This product does not support customization.', 400, 'NOT_CUSTOMIZABLE');
  }

  // FIX: Validate each ingredient is mapped to this product
  await validateIngredientsForProduct(products[0].id, ingredients);

  const totalPrice = await calculatePrice(ingredients);

  const [result] = await pool.execute(
    `INSERT INTO custom_drinks (customer_id, base_product_id, name, total_price, ingredients)
     VALUES (?, ?, ?, ?, ?)`,
    [customerId, base_product_id, name, totalPrice, JSON.stringify(ingredients)]
  );

  const [rows] = await pool.execute(
    `SELECT uuid, name, total_price, ingredients, is_favourite, order_count, created_at
       FROM custom_drinks WHERE id = ? LIMIT 1`,
    [result.insertId]
  );

  logger.info(`[CustomDrink] Customer ${customerId} created drink "${name}"`);
  return rows[0];
}

/**
 * GET /custom-drinks
 * List saved custom drinks for logged-in customer.
 */
async function listCustomDrinks(customerId, query) {
  const page   = parseInt(query.page,  10) || 1;
  const limit  = parseInt(query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  let sql = `SELECT cd.uuid, cd.name, cd.total_price, cd.ingredients,
                    cd.is_favourite, cd.order_count, cd.created_at,
                    p.name AS base_product_name
               FROM custom_drinks cd
               JOIN products p ON p.id = cd.base_product_id
              WHERE cd.customer_id = ?`;
  const params = [customerId];

  if (query.is_favourite !== undefined) {
    sql += ` AND cd.is_favourite = ?`;
    params.push(query.is_favourite ? 1 : 0);
  }

  sql += ` ORDER BY cd.order_count DESC, cd.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

  const [rows] = await pool.query(sql, params);

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM custom_drinks WHERE customer_id = ?`,
    [customerId]
  );

  return {
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

/**
 * GET /custom-drinks/:id
 */
async function getCustomDrinkByUUID(customerId, uuid) {
  const [rows] = await pool.execute(
    `SELECT cd.id, cd.uuid, cd.name, cd.total_price, cd.ingredients,
            cd.is_favourite, cd.order_count, cd.created_at,
            p.name AS base_product_name, p.uuid AS base_product_uuid
       FROM custom_drinks cd
       JOIN products p ON p.id = cd.base_product_id
      WHERE cd.uuid = ? AND cd.customer_id = ?
      LIMIT 1`,
    [uuid, customerId]
  );

  if (!rows.length) {
    throw new AppError('Custom drink not found.', 404, 'CUSTOM_DRINK_NOT_FOUND');
  }

  return rows[0];
}

/**
 * PATCH /custom-drinks/:id
 * Update name, ingredients, or favourite flag.
 * Re-validates ingredients if ingredients are updated.
 */
async function updateCustomDrink(customerId, uuid, updates) {
  const [rows] = await pool.execute(
    `SELECT cd.id, cd.base_product_id FROM custom_drinks cd
      WHERE cd.uuid = ? AND cd.customer_id = ? LIMIT 1`,
    [uuid, customerId]
  );

  if (!rows.length) {
    throw new AppError('Custom drink not found.', 404, 'CUSTOM_DRINK_NOT_FOUND');
  }

  const { id: drinkId, base_product_id } = rows[0];
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }

  if (updates.ingredients !== undefined) {
    // FIX: Re-validate ingredients against product when updating
    await validateIngredientsForProduct(base_product_id, updates.ingredients);
    const totalPrice = await calculatePrice(updates.ingredients);
    fields.push('ingredients = ?', 'total_price = ?');
    values.push(JSON.stringify(updates.ingredients), totalPrice);
  }

  if (updates.is_favourite !== undefined) {
    fields.push('is_favourite = ?');
    values.push(updates.is_favourite ? 1 : 0);
  }

  values.push(drinkId);

  await pool.execute(
    `UPDATE custom_drinks SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    values
  );

  return getCustomDrinkByUUID(customerId, uuid);
}

/**
 * DELETE /custom-drinks/:id
 */
async function deleteCustomDrink(customerId, uuid) {
  const [result] = await pool.execute(
    `DELETE FROM custom_drinks WHERE uuid = ? AND customer_id = ?`,
    [uuid, customerId]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Custom drink not found.', 404, 'CUSTOM_DRINK_NOT_FOUND');
  }

  return { message: 'Custom drink deleted successfully.' };
}

/**
 * POST /custom-drinks/:id/reorder
 * One-click reorder from saved custom drink.
 * FIX: Now applies GST tax + auto-generates KOT.
 */
async function reorderCustomDrink(customerId, uuid, { store_id, channel }) {
  const drink = await getCustomDrinkByUUID(customerId, uuid);

  // Increment order_count
  await pool.execute(
    `UPDATE custom_drinks SET order_count = order_count + 1 WHERE uuid = ?`,
    [uuid]
  );

  // Generate order number
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM orders WHERE DATE(created_at) = CURDATE()`
  );
  const orderNumber = `TOOF-${datePart}-${String(cnt + 1).padStart(4, '0')}`;

  // FIX: Apply tax like main order flow
  const subtotal     = parseFloat(drink.total_price);
  const taxAmount    = parseFloat((subtotal * TAX_RATE).toFixed(2));
  const totalAmount  = parseFloat((subtotal + taxAmount).toFixed(2));

  const [orderResult] = await pool.execute(
    `INSERT INTO orders
       (order_number, store_id, customer_id, channel, status,
        subtotal, discount_amount, tax_amount, total_amount, notes)
     VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?)`,
    [orderNumber, store_id, customerId, channel,
     subtotal, taxAmount, totalAmount, `Reorder: ${drink.name}`]
  );
  const orderId = orderResult.insertId;

  // Insert order item
  await pool.execute(
    `INSERT INTO order_items
       (order_id, product_id, custom_drink_id, quantity,
        unit_price, total_price, item_name, customizations)
     SELECT ?, base_product_id, id, 1, ?, ?, name, ingredients
       FROM custom_drinks WHERE uuid = ?`,
    [orderId, subtotal, subtotal, uuid]
  );

  // FIX: Auto-generate KOT so barista screen sees reorders
  const kotNumber = await generateKOTNumber(store_id);
  await pool.execute(
    `INSERT INTO kots (uuid, kot_number, order_id, store_id, status)
     VALUES (UUID(), ?, ?, ?, 'open')`,
    [kotNumber, orderId, store_id]
  );

  // Status history
  await pool.execute(
    `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by)
     VALUES (?, NULL, 'pending', ?)`,
    [orderId, customerId]
  );

  const [[order]] = await pool.execute(
    `SELECT o.uuid, o.order_number, o.status,
            o.subtotal, o.tax_amount, o.total_amount,
            o.created_at,
            k.uuid AS kot_uuid, k.kot_number
       FROM orders o
       LEFT JOIN kots k ON k.order_id = o.id
       WHERE o.id = ? LIMIT 1`,
    [orderId]
  );

  logger.info(`[CustomDrink] Customer ${customerId} reordered "${drink.name}" → ${orderNumber} (KOT: ${kotNumber})`);
  return order;
}

/**
 * POST /custom-drinks/:id/share
 * WhatsApp sharing stub — sends drink details via WhatsApp.
 * Wired when WhatsApp credentials are available.
 */
async function shareCustomDrink(customerId, uuid, storeId) {
  const drink = await getCustomDrinkByUUID(customerId, uuid);

  // Fetch customer details for the message
  const [userRows] = await pool.execute(
    `SELECT u.name, u.mobile, s.name AS store_name, s.city
       FROM users u
       LEFT JOIN stores s ON s.id = ?
       WHERE u.id = ? LIMIT 1`,
    [storeId || null, customerId]
  );

  const user = userRows[0] || {};

  // Build WhatsApp message payload (SOW: non-promotional format)
  const message = {
    type:    'custom_drink_share',
    drink: {
      name:        drink.name,
      total_price: parseFloat(drink.total_price),
      ingredients: typeof drink.ingredients === 'string'
        ? JSON.parse(drink.ingredients)
        : drink.ingredients,
    },
    customer: {
      name:   user.name   || 'A TOOF customer',
      mobile: user.mobile || null,
    },
    store: {
      name: user.store_name || 'TOOF',
      city: user.city       || null,
    },
    shared_at: new Date().toISOString(),
  };

  // Log to whatsapp_message_logs table
  await pool.execute(
    `INSERT INTO whatsapp_message_logs
       (mobile, template_name, payload, status)
     VALUES (?, 'custom_drink_share', ?, 'pending')`,
    [user.mobile || '', JSON.stringify(message)]
  );

  logger.info(`[CustomDrink] Share initiated for drink "${drink.name}" by customer ${customerId}`);

  // TODO: Wire to WhatsApp provider (MSG91 / Meta) when credentials available
  // await whatsappService.send(user.mobile, 'custom_drink_share', message);

  return {
    message:    'Drink share initiated.',
    drink_name: drink.name,
    status:     'pending', // Will be 'sent' once WhatsApp provider is wired
  };
}

module.exports = {
  createCustomDrink,
  listCustomDrinks,
  getCustomDrinkByUUID,
  updateCustomDrink,
  deleteCustomDrink,
  reorderCustomDrink,
  shareCustomDrink,
};