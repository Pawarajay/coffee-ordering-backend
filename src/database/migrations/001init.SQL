
SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;


CREATE TABLE IF NOT EXISTS stores (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid           VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  name           VARCHAR(150) NOT NULL,
  address        TEXT,
  city           VARCHAR(100),
  state          VARCHAR(100),
  pincode        VARCHAR(10),
  phone          VARCHAR(15),
  email          VARCHAR(100),
  timezone       VARCHAR(50)  NOT NULL DEFAULT 'Asia/Kolkata',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  operating_hours JSON,
  config         JSON,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid           VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  mobile         VARCHAR(15)  NOT NULL UNIQUE,
  name           VARCHAR(150),
  email          VARCHAR(150) UNIQUE,
  role           ENUM('super_admin','admin','store_manager','barista','customer')
                              NOT NULL DEFAULT 'customer',
  store_id       INT UNSIGNED,          
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  last_login_at  DATETIME,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_mobile ON users(mobile);
CREATE INDEX idx_users_role   ON users(role);

CREATE TABLE IF NOT EXISTS otp_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mobile      VARCHAR(15) NOT NULL,
  otp_hash    VARCHAR(255) NOT NULL,    
  expires_at  DATETIME    NOT NULL,
  is_used     TINYINT(1)  NOT NULL DEFAULT 0,
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_mobile (mobile),
  INDEX idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,  
  expires_at  DATETIME    NOT NULL,
  is_revoked  TINYINT(1)  NOT NULL DEFAULT 0,
  user_agent  VARCHAR(255),
  ip_address  VARCHAR(45),
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS categories (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid         VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  name         VARCHAR(100) NOT NULL,
  slug         VARCHAR(120) NOT NULL UNIQUE,
  description  TEXT,
  image_url    VARCHAR(500),
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS products (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  category_id     INT UNSIGNED  NOT NULL,
  name            VARCHAR(200)  NOT NULL,
  slug            VARCHAR(220)  NOT NULL UNIQUE,
  description     TEXT,
  product_type    ENUM('beverage','concentrate','food','addon') NOT NULL DEFAULT 'beverage',
  base_price      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  image_url       VARCHAR(500),
  is_customizable TINYINT(1)    NOT NULL DEFAULT 0,   -- Can use CYOD engine
  is_available_kiosk    TINYINT(1) NOT NULL DEFAULT 1,
  is_available_d2c      TINYINT(1) NOT NULL DEFAULT 0,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Nutritional / meta info
  meta            JSON,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_type     ON products(product_type);

CREATE TABLE IF NOT EXISTS ingredients (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  name          VARCHAR(150)  NOT NULL,
  unit          ENUM('ml','g','pcs','l','kg') NOT NULL DEFAULT 'ml',
  cost_per_unit DECIMAL(10,4) NOT NULL DEFAULT 0.0000,  -- cost per 1 unit
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  low_stock_threshold      DECIMAL(10,2) NOT NULL DEFAULT 100,
  critical_stock_threshold DECIMAL(10,2) NOT NULL DEFAULT 20,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ingredient_groups (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  description    VARCHAR(255),
  selection_type ENUM('single','multiple') NOT NULL DEFAULT 'single',
  is_required    TINYINT(1)   NOT NULL DEFAULT 0,
  display_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS ingredient_mappings (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id      INT UNSIGNED  NOT NULL,
  ingredient_id   INT UNSIGNED  NOT NULL,
  group_id        INT UNSIGNED,           -- If part of a CYOD group
  quantity        DECIMAL(10,2) NOT NULL, -- Default quantity in ingredient unit
  is_default      TINYINT(1)    NOT NULL DEFAULT 1,  -- Pre-selected in CYOD
  is_optional     TINYINT(1)    NOT NULL DEFAULT 0,  -- Can customer remove?
  price_override  DECIMAL(10,2),   -- NULL = use ingredient cost_per_unit * quantity
  min_qty         DECIMAL(10,2)    NOT NULL DEFAULT 0,
  max_qty         DECIMAL(10,2),   -- NULL = no max
  step_qty        DECIMAL(10,2)    NOT NULL DEFAULT 1, -- Increment step
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_ingredient (product_id, ingredient_id),
  FOREIGN KEY (product_id)    REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  FOREIGN KEY (group_id)      REFERENCES ingredient_groups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ORDERS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  order_number    VARCHAR(20)   NOT NULL UNIQUE,   -- e.g. TOOF-20240601-0001
  store_id        INT UNSIGNED  NOT NULL,
  customer_id     INT UNSIGNED,                    -- NULL for guest
  channel         ENUM('kiosk','qr_mobile','d2c_website','whatsapp','admin')
                                NOT NULL DEFAULT 'kiosk',
  status          ENUM('pending','confirmed','in_progress','ready','completed','cancelled','refunded')
                                NOT NULL DEFAULT 'pending',
  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  notes           TEXT,
  -- Timestamps for SLA tracking
  confirmed_at    DATETIME,
  in_progress_at  DATETIME,
  ready_at        DATETIME,
  completed_at    DATETIME,
  cancelled_at    DATETIME,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id)   REFERENCES stores(id),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_orders_store_status (store_id, status),
  INDEX idx_orders_customer     (customer_id),
  INDEX idx_orders_created      (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ORDER ITEMS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id        INT UNSIGNED  NOT NULL,
  product_id      INT UNSIGNED  NOT NULL,
  custom_drink_id INT UNSIGNED,           -- FK to custom_drinks if CYOD
  quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  unit_price      DECIMAL(10,2) NOT NULL,
  total_price     DECIMAL(10,2) NOT NULL,
  -- Snapshot of the drink name at time of order
  item_name       VARCHAR(200)  NOT NULL,
  notes           TEXT,
  -- Snapshot of customizations for display (denormalized)
  customizations  JSON,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_order_items_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ORDER ITEM INGREDIENTS (exact customizations per item)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_item_ingredients (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_item_id   INT UNSIGNED  NOT NULL,
  ingredient_id   INT UNSIGNED  NOT NULL,
  quantity        DECIMAL(10,2) NOT NULL,
  unit_price      DECIMAL(10,2) NOT NULL,  -- Price at time of order
  total_price     DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_item_id)  REFERENCES order_items(id)   ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id)  REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. CUSTOM DRINKS (CYOD saved drinks)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_drinks (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  customer_id     INT UNSIGNED  NOT NULL,
  base_product_id INT UNSIGNED  NOT NULL,
  name            VARCHAR(200)  NOT NULL,   -- Customer-given name
  total_price     DECIMAL(10,2) NOT NULL,
  ingredients     JSON          NOT NULL,   -- [{ingredient_id, qty, price}, ...]
  is_favourite    TINYINT(1)    NOT NULL DEFAULT 0,
  order_count     INT UNSIGNED  NOT NULL DEFAULT 0,  -- How many times ordered
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (base_product_id) REFERENCES products(id),
  INDEX idx_custom_drinks_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. KOT (Kitchen Order Tickets)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kots (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid         VARCHAR(36)  NOT NULL UNIQUE DEFAULT (UUID()),
  kot_number   VARCHAR(20)  NOT NULL UNIQUE,  -- e.g. KOT-20240601-0001
  order_id     INT UNSIGNED NOT NULL,
  store_id     INT UNSIGNED NOT NULL,
  barista_id   INT UNSIGNED,
  status       ENUM('open','in_progress','done','cancelled') NOT NULL DEFAULT 'open',
  printed_at   DATETIME,
  started_at   DATETIME,
  completed_at DATETIME,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)   REFERENCES orders(id),
  FOREIGN KEY (store_id)   REFERENCES stores(id),
  FOREIGN KEY (barista_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_kots_store_status (store_id, status),
  INDEX idx_kots_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  order_id            INT UNSIGNED  NOT NULL,
  amount              DECIMAL(10,2) NOT NULL,
  currency            VARCHAR(5)    NOT NULL DEFAULT 'INR',
  method              ENUM('upi','card','cash','wallet') NOT NULL,
  status              ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
  gateway_provider    VARCHAR(50),    -- 'razorpay', etc.
  gateway_order_id    VARCHAR(150),   -- ID from gateway
  gateway_payment_id  VARCHAR(150),   -- Confirmed payment ID
  gateway_signature   VARCHAR(300),   -- Webhook signature for verification
  gateway_response    JSON,           -- Full gateway response snapshot
  refund_amount       DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  refunded_at         DATETIME,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_payments_order (order_id),
  INDEX idx_payments_gateway_payment (gateway_payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. INVENTORY (per store)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id        INT UNSIGNED  NOT NULL,
  ingredient_id   INT UNSIGNED  NOT NULL,
  quantity        DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  reserved_qty    DECIMAL(12,3) NOT NULL DEFAULT 0.000,  -- Held for pending orders
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_ingredient (store_id, ingredient_id),
  FOREIGN KEY (store_id)     REFERENCES stores(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. INVENTORY TRANSACTIONS (full audit trail)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id        INT UNSIGNED  NOT NULL,
  ingredient_id   INT UNSIGNED  NOT NULL,
  txn_type        ENUM('stock_in','stock_out','adjustment','wastage','transfer','production')
                                NOT NULL,
  quantity        DECIMAL(12,3) NOT NULL,   -- Positive = in, Negative = out
  balance_after   DECIMAL(12,3) NOT NULL,
  reference_type  VARCHAR(50),   -- 'order', 'manual', 'production_batch', etc.
  reference_id    INT UNSIGNED,
  notes           TEXT,
  created_by      INT UNSIGNED,  -- user who made the entry
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id)     REFERENCES stores(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  FOREIGN KEY (created_by)   REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_inv_txn_store_ingredient (store_id, ingredient_id),
  INDEX idx_inv_txn_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. PRODUCTION BATCHES (central kitchen: raw material → finished product)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_batches (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  batch_number    VARCHAR(30)   NOT NULL UNIQUE,
  product_id      INT UNSIGNED  NOT NULL,    -- Finished product (concentrate, etc.)
  quantity_ml     DECIMAL(12,3) NOT NULL,    -- Quantity produced in ML
  produced_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      INT UNSIGNED,
  notes           TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)  REFERENCES products(id),
  FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. PRODUCTION BATCH INGREDIENTS (raw materials consumed per batch)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_batch_ingredients (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_id      INT UNSIGNED  NOT NULL,
  ingredient_id INT UNSIGNED  NOT NULL,
  quantity_used DECIMAL(12,3) NOT NULL,
  FOREIGN KEY (batch_id)      REFERENCES production_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. STOCK ALERTS LOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_alerts (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  store_id      INT UNSIGNED NOT NULL,
  ingredient_id INT UNSIGNED NOT NULL,
  alert_type    ENUM('low','critical','out_of_stock') NOT NULL,
  quantity_at_alert DECIMAL(12,3) NOT NULL,
  is_resolved   TINYINT(1) NOT NULL DEFAULT 0,
  resolved_at   DATETIME,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id)     REFERENCES stores(id),
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  INDEX idx_alerts_store (store_id, is_resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. WHATSAPP MESSAGE LOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  mobile          VARCHAR(15)  NOT NULL,
  template_name   VARCHAR(100) NOT NULL,
  payload         JSON,
  status          ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  provider_msg_id VARCHAR(150),
  error_message   TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wa_log_mobile (mobile),
  INDEX idx_wa_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. ACCOUNTING SYNC LOG
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounting_sync_logs (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference_type  VARCHAR(50)  NOT NULL,   -- 'order', 'payment', etc.
  reference_id    INT UNSIGNED NOT NULL,
  provider        VARCHAR(50)  NOT NULL,   -- 'zoho', 'tally'
  status          ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  external_id     VARCHAR(150),            -- ID from accounting software
  payload         JSON,
  response        JSON,
  error_message   TEXT,
  synced_at       DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_accounting_sync_ref (reference_type, reference_id),
  INDEX idx_accounting_sync_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. ORDER STATUS HISTORY (full audit trail of every status change)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_status_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id    INT UNSIGNED NOT NULL,
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL,
  changed_by  INT UNSIGNED,
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)  ON DELETE SET NULL,
  INDEX idx_order_history (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;