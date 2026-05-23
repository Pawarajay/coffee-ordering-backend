-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 005 — D2C Cart
-- Adds: d2c_carts and d2c_cart_items tables
-- Run: npm run migrate
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── D2C Cart ─────────────────────────────────────────────────────────────────
-- One cart per guest session OR one per logged-in customer.
-- When a guest logs in, the session cart is merged into the customer cart.
CREATE TABLE IF NOT EXISTS d2c_carts (
  id          INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  uuid        VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  session_id  VARCHAR(100)  UNIQUE,         -- Guest token from frontend
  customer_id INT UNSIGNED  UNIQUE,         -- Null for guests
  status      ENUM('active','checked_out','abandoned') NOT NULL DEFAULT 'active',
  -- Shipping / delivery info captured at checkout
  shipping_name    VARCHAR(150),
  shipping_phone   VARCHAR(15),
  shipping_address TEXT,
  shipping_city    VARCHAR(100),
  shipping_pincode VARCHAR(10),
  notes            TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_d2c_cart_session  (session_id),
  INDEX idx_d2c_cart_customer (customer_id),
  INDEX idx_d2c_cart_status   (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── D2C Cart Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS d2c_cart_items (
  id         INT UNSIGNED      AUTO_INCREMENT PRIMARY KEY,
  cart_id    INT UNSIGNED      NOT NULL,
  product_id INT UNSIGNED      NOT NULL,
  quantity   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2)     NOT NULL, -- Price snapshot when item was added
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cart_product (cart_id, product_id),
  FOREIGN KEY (cart_id)   REFERENCES d2c_carts(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;