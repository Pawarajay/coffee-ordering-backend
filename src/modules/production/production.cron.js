'use strict';

const cron                  = require('node-cron');
const { productionService } = require('./production.service');
const { pool }              = require('../../config/db');
const logger                = require('../../utils/logger');



function startProductionCrons() {

  cron.schedule('0 * * * *', async () => {
    logger.info('[Cron] Starting hourly central RM threshold scan...');
    try {
      const result = await productionService.runCentralRMThresholdScan();
      if (result.alerts.length > 0) {
        logger.warn(
          `[Cron] Central RM scan: ${result.alerts.length} alert(s) found ` +
          `out of ${result.scanned} ingredient(s) checked.`
        );
        result.alerts.forEach((a) =>
          logger.warn(
            `[Cron] ⚠ Central RM "${a.level}" — ${a.ingredient}: ${a.quantity} remaining`
          )
        );
      } else {
        logger.info(
          `[Cron] Central RM scan complete — ${result.scanned} ingredient(s) OK.`
        );
      }
    } catch (err) {
      logger.error('[Cron] Central RM threshold scan failed:', err.message);
    }
  });

  cron.schedule('0 8 * * *', async () => {
    logger.info('[Cron] Generating daily production summary...');
    try {
      const [batchRows] = await pool.execute(
        `SELECT COUNT(*) AS batch_count, COALESCE(SUM(quantity_ml), 0) AS total_ml_produced
           FROM production_batches
           WHERE DATE(produced_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
      );

      const [distRows] = await pool.execute(
        `SELECT channel, COUNT(*) AS count, SUM(quantity_ml) AS total_ml
           FROM distribution_logs
           WHERE DATE(distributed_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
           GROUP BY channel`
      );

      const [inventoryRows] = await pool.execute(
        `SELECT p.name, COALESCE(ci.quantity_ml, 0) AS quantity_ml
           FROM products p
           LEFT JOIN central_inventory ci ON ci.product_id = p.id
           WHERE p.is_active = 1
           ORDER BY quantity_ml ASC`
      );

      const [[{ lowCount }]] = await pool.execute(
        `SELECT COUNT(*) AS lowCount
           FROM central_raw_materials crm
           JOIN ingredients i ON i.id = crm.ingredient_id
           WHERE crm.quantity <= i.low_stock_threshold`
      );

      const b = batchRows[0];
      const distSummary = distRows.map(
        (r) => `${r.channel}: ${r.count} dispatch(es) — ${parseFloat(r.total_ml).toFixed(0)}ml`
      ).join(', ') || 'none';

      const invSummary = inventoryRows.map(
        (r) => `${r.name}: ${parseFloat(r.quantity_ml).toFixed(0)}ml`
      ).join(', ');

      logger.info(
        `[Cron] Daily Production Summary:\n` +
        `  Batches yesterday    : ${b.batch_count}\n` +
        `  Total ML produced    : ${parseFloat(b.total_ml_produced).toFixed(0)}ml\n` +
        `  Distributions        : ${distSummary}\n` +
        `  Central inventory    : ${invSummary}\n` +
        `  Low RM ingredients   : ${lowCount}`
      );

      if (parseInt(lowCount, 10) > 0) {
        logger.warn(
          `[Cron] ⚠ ${lowCount} central raw material(s) are at or below low stock threshold. ` +
          `Check GET /api/v1/production/raw-materials for details.`
        );
      }
    } catch (err) {
      logger.error('[Cron] Daily production summary failed:', err.message);
    }
  });

  logger.info(
    '[Cron] Production cron jobs scheduled:\n' +
    '  • Hourly central RM scan    : Every hour\n' +
    '  • Daily production summary  : 8 AM daily'
  );
}

module.exports = { startProductionCrons };