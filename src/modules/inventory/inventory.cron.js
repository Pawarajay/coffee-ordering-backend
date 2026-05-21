


'use strict';

const cron   = require('node-cron');
const { inventoryService } = require('./inventory.service');
const logger = require('../../utils/logger');

function startInventoryCrons() {

  cron.schedule('0 * * * *', async () => {
    logger.info('[Cron] Starting hourly inventory threshold scan...');
    try {
      await inventoryService.runThresholdScan();
    } catch (err) {
      logger.error('[Cron] Threshold scan error:', err.message);
    }
  });

  cron.schedule('0 2 * * *', async () => {
    logger.info('[Cron] Running daily stale-alert cleanup...');
    try {
      const [result] = await require('../../config/db').pool.execute(
        `UPDATE stock_alerts sa
           JOIN inventory inv
             ON inv.store_id      = sa.store_id
            AND inv.ingredient_id = sa.ingredient_id
           JOIN ingredients i ON i.id = sa.ingredient_id
           SET sa.is_resolved = 1, sa.resolved_at = NOW()
         WHERE sa.is_resolved = 0
           AND sa.alert_type  = 'low'
           AND inv.quantity   > i.low_stock_threshold`
      );
      logger.info(`[Cron] Stale-alert cleanup: ${result.affectedRows} alert(s) auto-resolved.`);
    } catch (err) {
      logger.error('[Cron] Stale-alert cleanup error:', err.message);
    }
  });

  cron.schedule('0 3 * * *', async () => {
    logger.info('[Cron] Syncing production batch statuses...');
    try {
      const [result] = await require('../../config/db').pool.execute(
        `UPDATE production_batches
           SET status = 'fully_distributed'
         WHERE status   = 'produced'
           AND output_units > 0
           AND distributed_units >= output_units`
      );
      logger.info(`[Cron] Batch sync: ${result.affectedRows} batch(es) marked fully_distributed.`);
    } catch (err) {
      logger.error('[Cron] Batch status sync error:', err.message);
    }
  });

  logger.info('[Cron] Inventory cron jobs scheduled (hourly scan, 2AM cleanup, 3AM batch sync).');
}

module.exports = { startInventoryCrons };