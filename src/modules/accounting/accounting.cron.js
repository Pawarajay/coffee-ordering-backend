'use strict';

const cron   = require('node-cron');
const { pool }             = require('../../config/db');
const { accountingService } = require('./accounting.service');
const env    = require('../../config/env');
const logger = require('../../utils/logger');



function startAccountingCrons() {
  const provider = env.accounting?.provider;

  if (!provider || provider === 'none') {
    logger.info('[Cron] Accounting provider not configured — accounting crons skipped.');
    return;
  }

  logger.info(`[Cron] Starting accounting cron jobs (provider: ${provider}).`);

  cron.schedule('55 23 * * *', async () => {
    logger.info('[Cron] Starting nightly accounting sync...');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await accountingService.syncBulk({
        date_from: today,
        date_to:   today,
        force:     false,  
      });

      logger.info(
        `[Cron] Nightly sync complete — ` +
        `synced: ${result.synced}, failed: ${result.failed}, ` +
        `skipped: ${result.skipped}, total: ${result.total}.`
      );

      if (result.failed > 0) {
        logger.warn(
          `[Cron] ${result.failed} order(s) failed to sync tonight. ` +
          `Retry job will attempt these in 2 hours.`
        );
        if (result.errors?.length) {
          result.errors.forEach((e) =>
            logger.warn(`[Cron] Failed sync — order: ${e.order_id}, error: ${e.error}`)
          );
        }
      }
    } catch (err) {
      logger.error('[Cron] Nightly accounting sync crashed:', err.message);
    }
  });

  cron.schedule('0 */2 * * *', async () => {
    logger.info('[Cron] Checking for failed accounting sync entries to retry...');
    try {
      const [failedLogs] = await pool.execute(
        `SELECT id FROM accounting_sync_logs
           WHERE status = 'failed'
           ORDER BY created_at ASC
           LIMIT 50`
      );

      if (!failedLogs.length) {
        logger.info('[Cron] No failed sync entries to retry.');
        return;
      }

      logger.info(`[Cron] Retrying ${failedLogs.length} failed sync entry(s)...`);

      let retried = 0, stillFailed = 0;

      const CHUNK = 5;
      for (let i = 0; i < failedLogs.length; i += CHUNK) {
        const chunk = failedLogs.slice(i, i + CHUNK);
        const results = await Promise.allSettled(
          chunk.map((log) => accountingService.retrySync(log.id))
        );

        results.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            retried++;
          } else {
            stillFailed++;
            logger.warn(
              `[Cron] Retry failed for log ${chunk[idx].id}: ${res.reason?.message}`
            );
          }
        });
      }

      logger.info(
        `[Cron] Retry job complete — retried: ${retried}, still failing: ${stillFailed}.`
      );
    } catch (err) {
      logger.error('[Cron] Retry job crashed:', err.message);
    }
  });

  /* ── Job 3: Weekly reconciliation report — Monday 8 AM ──────────────────── */
  cron.schedule('0 8 * * 1', async () => {
    logger.info('[Cron] Generating weekly accounting reconciliation report...');
    try {
      /* Orders completed this past week */
      const [weekOrders] = await pool.execute(
        `SELECT
           COUNT(*)                                    AS total_orders,
           SUM(total_amount)                           AS total_revenue,
           SUM(is_synced_to_accounting = 1)            AS synced_orders,
           SUM(is_synced_to_accounting = 0)            AS unsynced_orders,
           SUM(status = 'completed')                   AS completed_orders
         FROM orders
         WHERE status IN ('completed', 'ready')
           AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );

      /* Sync log summary for the week */
      const [weekLogs] = await pool.execute(
        `SELECT
           SUM(status = 'success') AS success,
           SUM(status = 'failed')  AS failed,
           COUNT(*)                AS total_attempts
         FROM accounting_sync_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
      );

      const orders = weekOrders[0];
      const logs   = weekLogs[0];

      logger.info(
        `[Cron] Weekly Accounting Report (${provider.toUpperCase()}):\n` +
        `  Orders this week  : ${orders.total_orders}\n` +
        `  Total revenue     : ₹${parseFloat(orders.total_revenue || 0).toFixed(2)}\n` +
        `  Synced to ${provider.padEnd(6)}: ${orders.synced_orders}\n` +
        `  Unsynced          : ${orders.unsynced_orders}\n` +
        `  Sync attempts     : ${logs.total_attempts}\n` +
        `  Successful syncs  : ${logs.success}\n` +
        `  Failed syncs      : ${logs.failed}`
      );

      /* Alert if there are still unsynced orders older than 24h */
      const [[{ stale }]] = await pool.execute(
        `SELECT COUNT(*) AS stale
           FROM orders
           WHERE is_synced_to_accounting = 0
             AND status = 'completed'
             AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      );

      if (parseInt(stale, 10) > 0) {
        logger.warn(
          `[Cron] ⚠ ${stale} completed order(s) are unsynced and older than 24 hours. ` +
          `Check GET /api/v1/accounting/sync-logs?status=failed for details.`
        );
      }
    } catch (err) {
      logger.error('[Cron] Weekly reconciliation report crashed:', err.message);
    }
  });

  logger.info(
    '[Cron] Accounting cron jobs scheduled:\n' +
    '  • Nightly sync      : 11:55 PM daily\n' +
    '  • Retry failed      : Every 2 hours\n' +
    '  • Weekly report     : Monday 8 AM'
  );
}

module.exports = { startAccountingCrons };