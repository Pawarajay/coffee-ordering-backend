
ALTER TABLE production_batches
  ADD INDEX IF NOT EXISTS idx_batch_product    (product_id),
  ADD INDEX IF NOT EXISTS idx_batch_created    (produced_at),
  ADD INDEX IF NOT EXISTS idx_batch_number     (batch_number);

ALTER TABLE production_batch_ingredients
  ADD INDEX IF NOT EXISTS idx_batch_ing_batch  (batch_id),
  ADD INDEX IF NOT EXISTS idx_batch_ing_ing    (ingredient_id);


CREATE TABLE IF NOT EXISTS distribution_logs (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  uuid            VARCHAR(36)   NOT NULL UNIQUE DEFAULT (UUID()),
  batch_id        INT UNSIGNED  NOT NULL,
  destination_store_id  INT UNSIGNED,
  channel         ENUM('kiosk','d2c','b2b') NOT NULL DEFAULT 'kiosk',
  quantity_ml     DECIMAL(12,3) NOT NULL,
  notes           TEXT,
  distributed_by  INT UNSIGNED,
  distributed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id)             REFERENCES production_batches(id),
  FOREIGN KEY (destination_store_id) REFERENCES stores(id) ON DELETE SET NULL,
  FOREIGN KEY (distributed_by)       REFERENCES users(id)  ON DELETE SET NULL,
  INDEX idx_dist_batch   (batch_id),
  INDEX idx_dist_store   (destination_store_id),
  INDEX idx_dist_channel (channel),
  INDEX idx_dist_at      (distributed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS central_inventory (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  product_id      INT UNSIGNED  NOT NULL,
  quantity_ml     DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_central_product (product_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS central_raw_materials (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  ingredient_id   INT UNSIGNED  NOT NULL UNIQUE,
  quantity        DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  INDEX idx_central_rm_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS central_raw_material_transactions (
  id              INT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  ingredient_id   INT UNSIGNED  NOT NULL,
  txn_type        ENUM('stock_in','consumed','adjustment','wastage') NOT NULL,
  quantity        DECIMAL(12,3) NOT NULL,  
  balance_after   DECIMAL(12,3) NOT NULL,
  reference_type  VARCHAR(50),           
  reference_id    INT UNSIGNED,
  notes           TEXT,
  created_by      INT UNSIGNED,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients(id),
  FOREIGN KEY (created_by)    REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_central_rm_txn_ingredient (ingredient_id),
  INDEX idx_central_rm_txn_created    (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;