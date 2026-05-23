
'use strict';

const { pool }                                 = require('../../config/db');
const { AppError }                             = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const logger                                   = require('../../utils/logger');

const D2C_STORE_ID = parseInt(process.env.D2C_STORE_ID, 10) || 1;

function getOrderService()     { return require('../orders/order.service').orderService; }
function getInventoryService() { return require('../inventory/inventory.service').inventoryService; }
function getWhatsAppService()  { return require('../whatsapp/whatsapp.service').whatsappService; }


async function fetchCartWithItems(cartId) {
  const [cartRows] = await pool.execute(
    `SELECT id, uuid, session_id, customer_id, status,
            shipping_name, shipping_phone, shipping_address,
            shipping_city, shipping_pincode, notes,
            created_at, updated_at
       FROM d2c_carts WHERE id = ? LIMIT 1`,
    [cartId]
  );
  if (!cartRows.length) return null;
  const cart = cartRows[0];

  const [items] = await pool.execute(
    `SELECT
       dci.id, dci.quantity, dci.unit_price,
       p.id    AS product_db_id,
       p.uuid  AS product_uuid,
       p.name  AS product_name,
       p.base_price AS current_price,
       p.image_url,
       p.is_active
     FROM d2c_cart_items dci
     JOIN products p ON p.id = dci.product_id
     WHERE dci.cart_id = ?
     ORDER BY dci.created_at ASC`,
    [cart.id]
  );

  return { cart, items };
}

function formatCart(cart, items) {
  const formattedItems = items.map((i) => ({
    product: {
      id:            i.product_uuid,
      name:          i.product_name,
      image_url:     i.image_url,
      current_price: parseFloat(i.current_price),
      is_active:     Boolean(i.is_active),
    },
    quantity:      i.quantity,
    unit_price:    parseFloat(i.unit_price),
    line_total:    parseFloat((i.unit_price * i.quantity).toFixed(2)),
    price_changed: parseFloat(i.unit_price) !== parseFloat(i.current_price),
  }));

  const subtotal    = formattedItems.reduce((s, i) => s + i.line_total, 0);
  const taxRate     = 0.18;
  const taxAmount   = parseFloat((subtotal * taxRate).toFixed(2));
  const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

  return {
    id:         cart.uuid,
    status:     cart.status,
    items:      formattedItems,
    item_count: formattedItems.reduce((s, i) => s + i.quantity, 0),
    financials: {
      subtotal:     parseFloat(subtotal.toFixed(2)),
      tax_amount:   taxAmount,
      tax_rate:     `${taxRate * 100}%`,
      total_amount: totalAmount,
    },
    shipping: {
      name:    cart.shipping_name    || null,
      phone:   cart.shipping_phone   || null,
      address: cart.shipping_address || null,
      city:    cart.shipping_city    || null,
      pincode: cart.shipping_pincode || null,
    },
    notes:      cart.notes || null,
    created_at: cart.created_at,
    updated_at: cart.updated_at,
  };
}


const d2cService = {

  async getCatalog(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = ['p.is_available_d2c = 1', 'p.is_active = 1'];
    const params     = [];

    if (query.category_id) { conditions.push('p.category_id = ?'); params.push(Number(query.category_id)); }
    if (query.search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      const term = `%${query.search}%`;
      params.push(term, term);
    }

    const where   = `WHERE ${conditions.join(' AND ')}`;
    const sortMap = {
      price_asc:  'p.base_price ASC',
      price_desc: 'p.base_price DESC',
      name_asc:   'p.name ASC',
      popular:    'order_count DESC, p.name ASC',
    };
    const orderBy = sortMap[query.sort_by] || 'p.name ASC';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p ${where}`, params
    );
    const [rows] = await pool.query(
      `SELECT
         p.id, p.uuid, p.name, p.slug, p.description,
         p.base_price, p.image_url, p.product_type, p.meta,
         c.id AS cat_id, c.name AS cat_name, c.slug AS cat_slug,
         COALESCE((
           SELECT SUM(oi.quantity)
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id
              AND o.channel = 'd2c_website'
              AND o.status IN ('completed','ready')
         ), 0) AS order_count
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ${parseInt(limit,10)} OFFSET ${parseInt(offset,10)}`,
      params
    );

    return {
      products: rows.map((r) => ({
        id:           r.uuid,
        name:         r.name,
        slug:         r.slug,
        description:  r.description,
        price:        parseFloat(r.base_price),
        image_url:    r.image_url,
        product_type: r.product_type,
        meta:         r.meta || null,
        category:     { id: r.cat_id, name: r.cat_name, slug: r.cat_slug },
        times_ordered: parseInt(r.order_count, 10),
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  async getProductBySlug(slug) {
    const [rows] = await pool.execute(
      `SELECT p.id, p.uuid, p.name, p.slug, p.description,
              p.base_price, p.image_url, p.product_type, p.meta,
              p.is_available_d2c, p.is_active,
              c.name AS cat_name, c.slug AS cat_slug
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ? AND p.is_available_d2c = 1 LIMIT 1`,
      [slug]
    );
    if (!rows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const r = rows[0];
    if (!r.is_active) throw new AppError('This product is currently unavailable.', 400, 'PRODUCT_UNAVAILABLE');

    return {
      id:           r.uuid,
      name:         r.name,
      slug:         r.slug,
      description:  r.description,
      price:        parseFloat(r.base_price),
      image_url:    r.image_url,
      product_type: r.product_type,
      meta:         r.meta || null,
      category:     { name: r.cat_name, slug: r.cat_slug },
    };
  },


  async toggleD2CAvailability(productUuid, isAvailable) {
    const [rows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!rows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');

    await pool.execute(
      'UPDATE products SET is_available_d2c = ? WHERE id = ?',
      [isAvailable ? 1 : 0, rows[0].id]
    );
    logger.info(`[D2C CMS] Product ${productUuid} D2C availability set to ${isAvailable}`);
    return { product_id: productUuid, is_available_d2c: Boolean(isAvailable) };
  },

  async updateProductSlug(productUuid, slug) {
    const [existing] = await pool.execute(
      'SELECT id FROM products WHERE slug = ? AND uuid != ? LIMIT 1', [slug, productUuid]
    );
    if (existing.length) throw new AppError('This slug is already in use.', 409, 'SLUG_CONFLICT');

    const [rows] = await pool.execute('SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]);
    if (!rows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');

    await pool.execute('UPDATE products SET slug = ? WHERE id = ?', [slug, rows[0].id]);
    return { product_id: productUuid, slug };
  },

  async getD2CCategories() {
    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.slug, COUNT(p.id) AS product_count
         FROM categories c
         JOIN products p ON p.category_id = c.id
           AND p.is_available_d2c = 1 AND p.is_active = 1
         GROUP BY c.id
         ORDER BY c.name ASC`
    );
    return rows.map((r) => ({
      id:            r.id,
      name:          r.name,
      slug:          r.slug,
      product_count: parseInt(r.product_count, 10),
    }));
  },


  async getOrCreateCart(sessionId = null, customerId = null) {
    let cartRow = null;

    if (customerId) {
      const [rows] = await pool.execute(
        `SELECT id FROM d2c_carts WHERE customer_id = ? AND status = 'active' LIMIT 1`,
        [customerId]
      );
      cartRow = rows[0] || null;
    } else if (sessionId) {
      const [rows] = await pool.execute(
        `SELECT id FROM d2c_carts WHERE session_id = ? AND status = 'active' LIMIT 1`,
        [sessionId]
      );
      cartRow = rows[0] || null;
    } else {
      throw new AppError('Either session_id or authentication is required.', 400, 'CART_IDENTITY_REQUIRED');
    }

    if (!cartRow) {
      const [result] = await pool.execute(
        `INSERT INTO d2c_carts (uuid, session_id, customer_id) VALUES (UUID(), ?, ?)`,
        [sessionId || null, customerId || null]
      );
      cartRow = { id: result.insertId };
    }

    const { cart, items } = await fetchCartWithItems(cartRow.id);
    return formatCart(cart, items);
  },

  async getCart(cartUuid, sessionId = null, customerId = null) {
    const [rows] = await pool.execute(
      'SELECT id, uuid, session_id, customer_id, status FROM d2c_carts WHERE uuid = ? LIMIT 1',
      [cartUuid]
    );
    if (!rows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');
    const cart = rows[0];

    if (cart.status !== 'active') throw new AppError('This cart has already been checked out.', 400, 'CART_INACTIVE');

    const isOwner = (customerId && cart.customer_id === customerId)
      || (sessionId && cart.session_id === sessionId)
      || (customerId && cart.customer_id === null);
    if (!isOwner) throw new AppError('Cart not found.', 404, 'NOT_FOUND');

    const { cart: fullCart, items } = await fetchCartWithItems(cart.id);
    return formatCart(fullCart, items);
  },

  /**
   * Add item to cart.
   * FIX: Accepts product UUID (not internal integer ID).
   *      Resolves UUID → internal product ID in service.
   */
  async addItem(cartUuid, data, sessionId = null, customerId = null) {
    const [cartRows] = await pool.execute(
      `SELECT id, customer_id, session_id, status FROM d2c_carts WHERE uuid = ? LIMIT 1`,
      [cartUuid]
    );
    if (!cartRows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');
    const cart = cartRows[0];
    if (cart.status !== 'active') throw new AppError('Cart is no longer active.', 400, 'CART_INACTIVE');

    /* FIX: resolve product by UUID */
    const [productRows] = await pool.execute(
      `SELECT id, base_price, name, is_active, is_available_d2c
         FROM products WHERE uuid = ? LIMIT 1`,
      [data.product_uuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');
    const product = productRows[0];

    if (!product.is_active || !product.is_available_d2c) {
      throw new AppError(
        `"${product.name}" is not available in the online store.`, 400, 'PRODUCT_NOT_D2C'
      );
    }

    await pool.execute(
      `INSERT INTO d2c_cart_items (cart_id, product_id, quantity, unit_price)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         quantity   = quantity + VALUES(quantity),
         unit_price = VALUES(unit_price)`,
      [cart.id, product.id, data.quantity, product.base_price]
    );

    const { cart: fullCart, items } = await fetchCartWithItems(cart.id);
    return formatCart(fullCart, items);
  },

  async updateItem(cartUuid, productUuid, quantity) {
    const [cartRows] = await pool.execute(
      'SELECT id, status FROM d2c_carts WHERE uuid = ? LIMIT 1', [cartUuid]
    );
    if (!cartRows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');
    const cart = cartRows[0];
    if (cart.status !== 'active') throw new AppError('Cart is no longer active.', 400, 'CART_INACTIVE');

    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');

    const [result] = await pool.execute(
      `UPDATE d2c_cart_items SET quantity = ? WHERE cart_id = ? AND product_id = ?`,
      [quantity, cart.id, productRows[0].id]
    );
    if (result.affectedRows === 0) throw new AppError('Item not found in cart.', 404, 'ITEM_NOT_FOUND');

    const { cart: fullCart, items } = await fetchCartWithItems(cart.id);
    return formatCart(fullCart, items);
  },

  async removeItem(cartUuid, productUuid) {
    const [cartRows] = await pool.execute(
      'SELECT id, status FROM d2c_carts WHERE uuid = ? LIMIT 1', [cartUuid]
    );
    if (!cartRows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');

    const [productRows] = await pool.execute(
      'SELECT id FROM products WHERE uuid = ? LIMIT 1', [productUuid]
    );
    if (!productRows.length) throw new AppError('Product not found.', 404, 'NOT_FOUND');

    const [result] = await pool.execute(
      'DELETE FROM d2c_cart_items WHERE cart_id = ? AND product_id = ?',
      [cartRows[0].id, productRows[0].id]
    );
    if (result.affectedRows === 0) throw new AppError('Item not found in cart.', 404, 'ITEM_NOT_FOUND');

    const { cart: fullCart, items } = await fetchCartWithItems(cartRows[0].id);
    return formatCart(fullCart, items);
  },

  async clearCart(cartUuid) {
    const [cartRows] = await pool.execute(
      'SELECT id FROM d2c_carts WHERE uuid = ? LIMIT 1', [cartUuid]
    );
    if (!cartRows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');
    await pool.execute('DELETE FROM d2c_cart_items WHERE cart_id = ?', [cartRows[0].id]);
    const { cart, items } = await fetchCartWithItems(cartRows[0].id);
    return formatCart(cart, items);
  },

  async mergeCarts(guestSessionId, customerId) {
    const [guestRows] = await pool.execute(
      `SELECT id FROM d2c_carts WHERE session_id = ? AND status = 'active' LIMIT 1`,
      [guestSessionId]
    );
    if (!guestRows.length) return d2cService.getOrCreateCart(null, customerId);

    const guestCartId = guestRows[0].id;
    let   customerCartId;

    const [custRows] = await pool.execute(
      `SELECT id FROM d2c_carts WHERE customer_id = ? AND status = 'active' LIMIT 1`,
      [customerId]
    );
    if (custRows.length) {
      customerCartId = custRows[0].id;
    } else {
      const [result] = await pool.execute(
        `INSERT INTO d2c_carts (uuid, customer_id) VALUES (UUID(), ?)`, [customerId]
      );
      customerCartId = result.insertId;
    }

    const [guestItems] = await pool.execute(
      'SELECT product_id, quantity, unit_price FROM d2c_cart_items WHERE cart_id = ?',
      [guestCartId]
    );

    for (const item of guestItems) {
      await pool.execute(
        `INSERT INTO d2c_cart_items (cart_id, product_id, quantity, unit_price)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           quantity   = GREATEST(quantity, VALUES(quantity)),
           unit_price = VALUES(unit_price)`,
        [customerCartId, item.product_id, item.quantity, item.unit_price]
      );
    }

    await pool.execute(
      `UPDATE d2c_carts SET status = 'abandoned' WHERE id = ?`, [guestCartId]
    );

    logger.info(`[D2C] Guest cart ${guestCartId} merged into customer ${customerId}.`);
    const { cart, items } = await fetchCartWithItems(customerCartId);
    return formatCart(cart, items);
  },

  /* ── Checkout ─────────────────────────────────────────────────────────────── */

  /**
   * Checkout — places the D2C order.
   *
   * FIX 1: Delegates order creation to orderService.create() so all
   *         side-effects fire: KOT, inventory deduction, WS notify, WhatsApp.
   * FIX 2: Payment initiated via orderService.initiatePayment() —
   *         returns gateway_order_id for frontend Razorpay modal.
   * FIX 3: Order number generated by orderService (store-scoped, no duplicates).
   * FIX 4: WhatsApp confirmation fires inside orderService.create().
   * FIX 5: Inventory deduction fires inside orderService.recordPayment().
   */
  async checkout(cartUuid, checkoutData, customerId = null) {
    const [cartRows] = await pool.execute(
      `SELECT id, uuid, customer_id, session_id, status FROM d2c_carts WHERE uuid = ? LIMIT 1`,
      [cartUuid]
    );
    if (!cartRows.length) throw new AppError('Cart not found.', 404, 'NOT_FOUND');
    const cart = cartRows[0];

    if (cart.status !== 'active') throw new AppError('This cart has already been checked out.', 400, 'CART_CHECKED_OUT');

    const { items } = await fetchCartWithItems(cart.id);
    if (!items.length) throw new AppError('Your cart is empty.', 400, 'EMPTY_CART');

    /* Check for unavailable items */
    const unavailable = items.filter((i) => !i.product.is_active);
    if (unavailable.length) {
      throw new AppError(
        `Some items are no longer available: ${unavailable.map((i) => i.product.name).join(', ')}`,
        400, 'ITEMS_UNAVAILABLE'
      );
    }

    /* Update shipping details on cart */
    await pool.execute(
      `UPDATE d2c_carts SET
         shipping_name = ?, shipping_phone = ?, shipping_address = ?,
         shipping_city = ?, shipping_pincode = ?, notes = ?
       WHERE id = ?`,
      [
        checkoutData.shipping_name,    checkoutData.shipping_phone,
        checkoutData.shipping_address, checkoutData.shipping_city,
        checkoutData.shipping_pincode, checkoutData.notes || null,
        cart.id,
      ]
    );

    /*
     * FIX 1-4: Delegate to orderService.create() — this ensures:
     *   ✅ Store-scoped order number (no duplicates)
     *   ✅ KOT auto-generated
     *   ✅ WS barista notify
     *   ✅ WhatsApp order confirmation
     *   ✅ Inventory deduction triggered on payment
     *   ✅ Tax calculation consistent with rest of platform
     */
    const orderPayload = {
      store_id: D2C_STORE_ID,
      channel:  'd2c_website',
      notes:    checkoutData.notes || null,
      items:    items.map((i) => ({
        product_id: i.product.id,
        quantity:   i.quantity,
        notes:      null,
      })),
    };

    const resolvedCustomerId = customerId || cart.customer_id || null;
    const newOrder = await getOrderService().create(orderPayload, resolvedCustomerId);

    /* FIX 2: Initiate Razorpay payment — returns gateway_order_id for frontend */
    let paymentInit = null;
    try {
      paymentInit = await getOrderService().initiatePayment(newOrder.id, {
        method: checkoutData.payment_method,
      });
    } catch (payErr) {
      logger.warn(`[D2C] Payment initiation non-fatal: ${payErr.message}`);
    }

    /* Mark cart as checked out */
    await pool.execute(
      `UPDATE d2c_carts SET status = 'checked_out' WHERE id = ?`, [cart.id]
    );

    logger.info(`[D2C] Checkout complete — order ${newOrder.order_number}.`);

    return {
      order: {
        id:           newOrder.id,
        order_number: newOrder.order_number,
        status:       newOrder.status,
        financials:   newOrder.financials,
        shipping: {
          name:    checkoutData.shipping_name,
          phone:   checkoutData.shipping_phone,
          address: checkoutData.shipping_address,
          city:    checkoutData.shipping_city,
          pincode: checkoutData.shipping_pincode,
        },
        created_at: newOrder.timestamps?.created_at,
      },
      /*
       * payment_init contains gateway_order_id + key.
       * Frontend uses this to open the Razorpay checkout modal.
       * In stub mode (no credentials): { gateway_order_id: 'stub_...', key: 'rzp_test_STUB_KEY' }
       */
      payment_init: paymentInit,
    };
  },

  /* ── D2C order history ───────────────────────────────────────────────────── */

  async getD2COrders(customerId, query) {
    const { page, limit, offset } = parsePagination(query);
    const lim = parseInt(limit, 10);
    const off = parseInt(offset, 10);

    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM orders
         WHERE customer_id = ? AND channel = 'd2c_website'`,
      [customerId]
    );
    const [rows] = await pool.query(
      `SELECT
         o.uuid         AS order_id,
         o.order_number,
         o.status,
         o.total_amount,
         o.created_at,
         p.status       AS payment_status,
         GROUP_CONCAT(oi.item_name ORDER BY oi.id SEPARATOR ', ') AS items_summary,
         COUNT(oi.id)   AS item_count
       FROM orders o
       LEFT JOIN payments    p  ON p.order_id  = o.id AND p.status = 'success'
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.customer_id = ? AND o.channel = 'd2c_website'
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      [customerId]
    );

    return {
      orders: rows.map((r) => ({
        id:             r.order_id,
        order_number:   r.order_number,
        status:         r.status,
        payment_status: r.payment_status || 'pending',
        total_amount:   parseFloat(r.total_amount),
        item_count:     parseInt(r.item_count, 10),
        items_summary:  r.items_summary,
        created_at:     r.created_at,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  /**
   * D2C order detail — NEW.
   * Customer can view full order (items, shipping, payment status).
   * SOW §8 — D2C E-commerce Website.
   */
  async getD2COrderDetail(orderUuid, customerId) {
    const [rows] = await pool.execute(
      `SELECT o.id, o.uuid, o.order_number, o.status, o.channel,
              o.subtotal, o.tax_amount, o.total_amount,
              o.notes, o.created_at, o.completed_at,
              p.status AS payment_status, p.method AS payment_method,
              p.amount AS payment_amount
         FROM orders o
         LEFT JOIN payments p ON p.order_id = o.id AND p.status IN ('success','pending')
         WHERE o.uuid = ? AND o.channel = 'd2c_website' LIMIT 1`,
      [orderUuid]
    );
    if (!rows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');
    const order = rows[0];

    /* Ownership check */
    const [ownerCheck] = await pool.execute(
      'SELECT customer_id FROM orders WHERE id = ? LIMIT 1', [order.id]
    );
    if (ownerCheck[0].customer_id !== customerId) {
      throw new AppError('Order not found.', 404, 'NOT_FOUND');
    }

    /* Fetch shipping from d2c_cart (stored on checkout) */
    const [cartRows] = await pool.execute(
      `SELECT shipping_name, shipping_phone, shipping_address,
              shipping_city, shipping_pincode
         FROM d2c_carts
         WHERE status = 'checked_out'
           AND customer_id = (SELECT customer_id FROM orders WHERE id = ? LIMIT 1)
         ORDER BY updated_at DESC LIMIT 1`,
      [order.id]
    );
    const shipping = cartRows[0] || {};

    /* Items */
    const [items] = await pool.execute(
      `SELECT oi.item_name, oi.quantity, oi.unit_price, oi.total_price,
              p.uuid AS product_uuid, p.image_url
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = ?`,
      [order.id]
    );

    return {
      id:           order.uuid,
      order_number: order.order_number,
      status:       order.status,
      items:        items.map((i) => ({
        product_id:  i.product_uuid,
        name:        i.item_name,
        quantity:    i.quantity,
        unit_price:  parseFloat(i.unit_price),
        total_price: parseFloat(i.total_price),
        image_url:   i.image_url || null,
      })),
      financials: {
        subtotal:     parseFloat(order.subtotal),
        tax_amount:   parseFloat(order.tax_amount),
        total_amount: parseFloat(order.total_amount),
      },
      shipping: {
        name:    shipping.shipping_name    || null,
        phone:   shipping.shipping_phone   || null,
        address: shipping.shipping_address || null,
        city:    shipping.shipping_city    || null,
        pincode: shipping.shipping_pincode || null,
      },
      payment: {
        status: order.payment_status || 'pending',
        method: order.payment_method || null,
        amount: order.payment_amount ? parseFloat(order.payment_amount) : null,
      },
      notes:      order.notes || null,
      created_at: order.created_at,
    };
  },
};

module.exports = { d2cService };