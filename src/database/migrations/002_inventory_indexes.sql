
ALTER TABLE inventory
  ADD INDEX idx_inventory_store (store_id),
  ADD INDEX idx_inventory_qty   (store_id, quantity);

ALTER TABLE inventory_transactions
  ADD INDEX idx_inv_txn_type    (txn_type),
  ADD INDEX idx_inv_txn_ref     (reference_type, reference_id);

ALTER TABLE stock_alerts
  ADD INDEX idx_alerts_unresolved (store_id, ingredient_id, is_resolved);
ALTER TABLE stock_alerts
  ADD COLUMN `dedup_key` VARCHAR(120)
    GENERATED ALWAYS AS (
      IF(is_resolved = 0,
        CONCAT(store_id, '_', ingredient_id, '_', alert_type),
        NULL
      )
    ) VIRTUAL,
  ADD UNIQUE INDEX uq_active_alert (dedup_key);