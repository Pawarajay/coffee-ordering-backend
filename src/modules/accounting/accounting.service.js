
'use strict';

const axios  = require('axios');
const { pool }     = require('../../config/db');
const { AppError } = require('../../middlewares/error.middleware');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const env    = require('../../config/env');
const logger = require('../../utils/logger');


let zohoTokenCache = { accessToken: null, expiresAt: 0 };

async function getZohoAccessToken() {
  if (zohoTokenCache.accessToken && Date.now() < zohoTokenCache.expiresAt - 60_000) {
    return zohoTokenCache.accessToken;
  }

  const { zoho } = env.accounting;
  if (!zoho.clientId || !zoho.clientSecret || !zoho.refreshToken) {
    throw new AppError(
      'Zoho Books credentials are not configured. ' +
      'Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in .env.',
      503, 'ACCOUNTING_NOT_CONFIGURED'
    );
  }

  try {
    const response = await axios.post(
      'https://accounts.zoho.in/oauth/v2/token', null,
      {
        params: {
          grant_type:    'refresh_token',
          client_id:     zoho.clientId,
          client_secret: zoho.clientSecret,
          refresh_token: zoho.refreshToken,
        },
        timeout: 10_000,
      }
    );

    const { access_token, expires_in } = response.data;
    if (!access_token)
      throw new Error('No access_token in Zoho response: ' + JSON.stringify(response.data));

    zohoTokenCache = {
      accessToken: access_token,
      expiresAt:   Date.now() + (expires_in * 1000),
    };

    logger.info('[Accounting] Zoho access token refreshed.');
    return access_token;
  } catch (err) {
    logger.error('[Accounting] Failed to refresh Zoho token:', err.message);
    throw new AppError(
      'Could not authenticate with Zoho Books. Check your credentials.',
      503, 'ZOHO_AUTH_FAILED'
    );
  }
}


async function pushOrderToZoho(orderData) {
  const accessToken    = await getZohoAccessToken();
  const organizationId = env.accounting.zoho.organizationId;
  const BASE_URL       = 'https://www.zohoapis.in/books/v3';

  const headers = {
    Authorization:  `Zoho-oauthtoken ${accessToken}`,
    'Content-Type': 'application/json',
  };


  let zohoContactId = null;
  if (orderData.customer_mobile) {
    const normalizedMobile = normalizeMobile(orderData.customer_mobile);

    try {
      /* Try E.164 format first, then raw stored format */
      for (const phone of [normalizedMobile, orderData.customer_mobile]) {
        const searchRes = await axios.get(`${BASE_URL}/contacts`, {
          headers,
          params: { organization_id: organizationId, phone },
          timeout: 10_000,
        });
        const contacts = searchRes.data?.contacts || [];
        if (contacts.length > 0) {
          zohoContactId = contacts[0].contact_id;
          break;
        }
      }

      if (!zohoContactId) {
        const createRes = await axios.post(
          `${BASE_URL}/contacts`,
          {
            contact_name: orderData.customer_name || normalizedMobile,
            contact_type: 'customer',
            phone:        normalizedMobile,
            email:        orderData.customer_email || undefined,
          },
          { headers, params: { organization_id: organizationId }, timeout: 10_000 }
        );
        zohoContactId = createRes.data?.contact?.contact_id;
      }
    } catch (err) {
      logger.warn('[Accounting] Zoho contact lookup/create failed (non-fatal):', err.message);
    }
  }

  const lineItems = orderData.items.map((item) => ({
    name:        item.item_name,
    description: item.notes || undefined,
    rate:        parseFloat(item.unit_price),
    quantity:    item.quantity,
    amount:      parseFloat(item.total_price),
  }));

  const invoicePayload = {
    customer_id:      zohoContactId || undefined,
    reference_number: orderData.order_number,
    date:             new Date(orderData.created_at).toISOString().slice(0, 10),
    line_items:       lineItems,
    sub_total:        parseFloat(orderData.subtotal),
    tax_total:        parseFloat(orderData.tax_amount),
    total:            parseFloat(orderData.total_amount),
    notes:            `TOOF Order | Channel: ${orderData.channel} | Store: ${orderData.store_name}`,
    custom_fields: [
      { label: 'TOOF Order ID', value: orderData.order_uuid },
      { label: 'Channel',       value: orderData.channel },
      { label: 'Store',         value: orderData.store_name },
    ],
  };

  const invoiceRes = await axios.post(
    `${BASE_URL}/invoices`,
    { invoice: invoicePayload },
    { headers, params: { organization_id: organizationId }, timeout: 15_000 }
  );

  const invoice = invoiceRes.data?.invoice;
  if (!invoice)
    throw new Error('Zoho did not return an invoice object: ' + JSON.stringify(invoiceRes.data));

  if (orderData.payment_status === 'success' && orderData.payment_amount) {
    try {
      await axios.post(
        `${BASE_URL}/customerpayments`,
        {
          customer_payment: {
            customer_id:      zohoContactId || undefined,
            payment_mode:     orderData.payment_method || 'upi',
            amount:           parseFloat(orderData.payment_amount),
            date:             new Date(orderData.created_at).toISOString().slice(0, 10),
            reference_number: orderData.gateway_payment_id || orderData.order_number,
            invoices: [{
              invoice_id:     invoice.invoice_id,
              amount_applied: parseFloat(orderData.payment_amount),
            }],
          },
        },
        { headers, params: { organization_id: organizationId }, timeout: 10_000 }
      );
    } catch (payErr) {
      logger.warn('[Accounting] Zoho payment recording failed (non-fatal):', payErr.message);
    }
  }

  return invoice;
}

/* ─── Tally adapter ──────────────────────────────────────────────────────── */

async function pushOrderToTally(orderData) {
  /*
   * FIX: Guard for missing Tally config — mirrors the Zoho credential check.
   * Without this, axios throws a generic connection error with no useful context.
   */
  const tallyUrl = process.env.TALLY_SERVER_URL;
  if (!tallyUrl) {
    throw new AppError(
      'Tally server is not configured. Set TALLY_SERVER_URL in .env ' +
      '(e.g. http://localhost:9000).',
      503, 'ACCOUNTING_NOT_CONFIGURED'
    );
  }

  const xml = buildTallyVoucherXML(orderData);

  const response = await axios.post(tallyUrl, xml, {
    headers: { 'Content-Type': 'application/xml' },
    timeout: 15_000,
  });

  const responseText = response.data?.toString() || '';
  if (responseText.includes('LINEERROR') || responseText.includes('Error'))
    throw new Error('Tally rejected the voucher: ' + responseText.substring(0, 500));

  return { status: 'accepted', raw: responseText };
}

function buildTallyVoucherXML(orderData) {
  const date = new Date(orderData.created_at)
    .toISOString().slice(0, 10).replace(/-/g, '');

  const ledgerEntries = orderData.items
    .map((item) => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${escapeXML(item.item_name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>-${parseFloat(item.total_price).toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`)
    .join('');

  return `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Vouchers</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>TOOF</SVCURRENTCOMPANY>
            </STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>${date}</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>${escapeXML(orderData.order_number)}</VOUCHERNUMBER>
                <NARRATION>TOOF | ${escapeXML(orderData.channel)} | ${escapeXML(orderData.store_name)}</NARRATION>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sundry Debtors</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-${parseFloat(orderData.total_amount).toFixed(2)}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                ${ledgerEntries}
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>GST Output</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>${parseFloat(orderData.tax_amount).toFixed(2)}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`.trim();
}

function escapeXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * FIX: Normalize Indian mobile numbers to E.164 (+91XXXXXXXXXX).
 * Handles: 9876543210, 09876543210, +919876543210, 91-9876543210
 */
function normalizeMobile(mobile) {
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10)              return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0'))  return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

/* ─── Internal DB helpers ────────────────────────────────────────────────── */

async function fetchOrderForSync(orderUuid) {
  const [orderRows] = await pool.execute(
    `SELECT
       o.id, o.uuid AS order_uuid, o.order_number, o.channel,
       o.subtotal, o.tax_amount, o.total_amount, o.status,
       o.created_at,
       s.name AS store_name,
       u.name AS customer_name,
       u.mobile AS customer_mobile,
       u.email AS customer_email,
       p.status AS payment_status,
       p.amount AS payment_amount,
       p.method AS payment_method,
       p.gateway_payment_id
     FROM orders o
     JOIN stores s    ON s.id = o.store_id
     LEFT JOIN users u ON u.id = o.customer_id
     LEFT JOIN payments p ON p.order_id = o.id AND p.status = 'success'
     WHERE o.uuid = ? LIMIT 1`,
    [orderUuid]
  );
  if (!orderRows.length) throw new AppError('Order not found.', 404, 'NOT_FOUND');

  const order = orderRows[0];
  const [items] = await pool.execute(
    `SELECT item_name, quantity, unit_price, total_price, notes
       FROM order_items WHERE order_id = ?`,
    [order.id]
  );

  return { ...order, items };
}

async function writeSyncLog({
  referenceType, referenceId, status,
  externalId, payload, response, errorMessage,
}) {
  await pool.execute(
    `INSERT INTO accounting_sync_logs
       (reference_type, reference_id, provider, status, external_id,
        payload, response, error_message, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status        = VALUES(status),
       external_id   = VALUES(external_id),
       response      = VALUES(response),
       error_message = VALUES(error_message),
       synced_at     = VALUES(synced_at)`,
    [
      referenceType, referenceId, env.accounting.provider,
      status, externalId || null,
      payload  ? JSON.stringify(payload)  : null,
      response ? JSON.stringify(response) : null,
      errorMessage || null,
      status === 'success' ? new Date() : null,
    ]
  );
}

/* ─── Accounting Service ─────────────────────────────────────────────────── */

const accountingService = {

  /**
   * Push a single order to the configured accounting provider.
   *
   * FIX: After successful sync, updates orders.is_synced_to_accounting = 1
   *      so GET /orders/accounting/unsynced reflects the real state.
   */
  async syncOrder(orderUuid, force = false) {
    const orderData = await fetchOrderForSync(orderUuid);

    if (!force) {
      const [existingLog] = await pool.execute(
        `SELECT id FROM accounting_sync_logs
           WHERE reference_type = 'order' AND reference_id = ? AND status = 'success'
           LIMIT 1`,
        [orderData.id]
      );
      if (existingLog.length)
        throw new AppError(
          `Order ${orderData.order_number} already synced. Use force=true to re-sync.`,
          409, 'ALREADY_SYNCED'
        );
    }

    let result, externalId, syncStatus, errorMessage;

    try {
      if (env.accounting.provider === 'zoho') {
        result     = await pushOrderToZoho(orderData);
        externalId = result?.invoice_id?.toString();
      } else if (env.accounting.provider === 'tally') {
        result     = await pushOrderToTally(orderData);
        externalId = null;
      } else {
        throw new AppError(
          `Unknown accounting provider: ${env.accounting.provider}`,
          503, 'UNSUPPORTED_PROVIDER'
        );
      }

      syncStatus = 'success';

      /*
       * FIX: Update is_synced_to_accounting on the order.
       * Without this, GET /orders/accounting/unsynced keeps listing
       * the order even after a successful Zoho/Tally push.
       */
      await pool.execute(
        `UPDATE orders
           SET is_synced_to_accounting = 1,
               accounting_synced_at    = NOW()
           WHERE id = ?`,
        [orderData.id]
      );

      logger.info(
        `[Accounting] Order ${orderData.order_number} synced to ` +
        `${env.accounting.provider}. External ID: ${externalId}`
      );
    } catch (err) {
      syncStatus   = 'failed';
      errorMessage = err.message;
      logger.error(
        `[Accounting] Sync failed for ${orderData.order_number}: ${err.message}`
      );
    }

    await writeSyncLog({
      referenceType: 'order',
      referenceId:   orderData.id,
      status:        syncStatus,
      externalId,
      payload:  { order_number: orderData.order_number, total: orderData.total_amount },
      response: result || null,
      errorMessage,
    });

    if (syncStatus === 'failed')
      throw new AppError(
        `Sync to ${env.accounting.provider} failed: ${errorMessage}`,
        502, 'SYNC_FAILED'
      );

    return {
      order_number: orderData.order_number,
      provider:     env.accounting.provider,
      external_id:  externalId,
      status:       syncStatus,
    };
  },

  /**
   * Bulk sync — processes in parallel batches of 5 to avoid timeouts.
   *
   * FIX: was fully sequential (await inside for loop). For large date
   *      ranges (month-end) this would timeout. Now uses Promise.allSettled
   *      with a concurrency limit of 5.
   */
  async syncBulk(data) {
    const { date_from, date_to, order_ids, force } = data;

    let orderUuids = [];

    if (order_ids?.length) {
      orderUuids = order_ids;
    } else {
      const conditions = [
        "o.status IN ('completed', 'ready')",
        'DATE(o.created_at) >= ?',
        'DATE(o.created_at) <= ?',
      ];
      const params = [
        new Date(date_from).toISOString().slice(0, 10),
        new Date(date_to).toISOString().slice(0, 10),
      ];

      if (!force) {
        conditions.push(`o.id NOT IN (
          SELECT reference_id FROM accounting_sync_logs
          WHERE reference_type = 'order' AND status = 'success'
        )`);
      }

      const [rows] = await pool.execute(
        `SELECT o.uuid FROM orders o
           WHERE ${conditions.join(' AND ')}
           ORDER BY o.created_at ASC`,
        params
      );
      orderUuids = rows.map((r) => r.uuid);
    }

    if (!orderUuids.length)
      return { synced: 0, failed: 0, skipped: 0, message: 'No orders to sync.' };

    /* Process in chunks of 5 concurrently */
    const CHUNK_SIZE = 5;
    let synced = 0, failed = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < orderUuids.length; i += CHUNK_SIZE) {
      const chunk = orderUuids.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map((uuid) => accountingService.syncOrder(uuid, force))
      );

      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        if (res.status === 'fulfilled') {
          synced++;
        } else {
          const err = res.reason;
          if (err?.code === 'ALREADY_SYNCED') {
            skipped++;
          } else {
            failed++;
            errors.push({ order_id: chunk[j], error: err?.message });
          }
        }
      }
    }

    logger.info(
      `[Accounting] Bulk sync: ${synced} synced, ${failed} failed, ` +
      `${skipped} skipped of ${orderUuids.length} total.`
    );

    return {
      total:   orderUuids.length,
      synced,
      failed,
      skipped,
      errors:  errors.length ? errors : undefined,
    };
  },

  /**
   * Retry a specific failed sync log entry.
   */
  async retrySync(logId) {
    const [rows] = await pool.execute(
      `SELECT id, reference_type, reference_id, status
         FROM accounting_sync_logs WHERE id = ? LIMIT 1`,
      [logId]
    );
    if (!rows.length) throw new AppError('Sync log entry not found.', 404, 'NOT_FOUND');
    const log = rows[0];

    if (log.status === 'success')
      throw new AppError(
        'This sync entry already succeeded.', 409, 'ALREADY_SYNCED'
      );
    if (log.reference_type !== 'order')
      throw new AppError(
        `Retry not supported for reference_type: ${log.reference_type}`,
        400, 'UNSUPPORTED_TYPE'
      );

    const [orderRows] = await pool.execute(
      'SELECT uuid FROM orders WHERE id = ? LIMIT 1', [log.reference_id]
    );
    if (!orderRows.length) throw new AppError('Referenced order not found.', 404, 'NOT_FOUND');

    /* Delete the failed log so syncOrder doesn't reject as ALREADY_SYNCED */
    await pool.execute('DELETE FROM accounting_sync_logs WHERE id = ?', [log.id]);

    return accountingService.syncOrder(orderRows[0].uuid, true);
  },

  /**
   * Sync logs audit trail.
   * FIX: uses pool.query() with interpolated LIMIT/OFFSET to avoid ER_WRONG_ARGUMENTS.
   */
  async getSyncLogs(query) {
    const { page, limit, offset } = parsePagination(query);
    const conditions = [];
    const params     = [];

    if (query.status)
      { conditions.push('al.status = ?');         params.push(query.status); }
    if (query.reference_type)
      { conditions.push('al.reference_type = ?'); params.push(query.reference_type); }
    if (query.date_from)
      { conditions.push('DATE(al.created_at) >= ?');
        params.push(new Date(query.date_from).toISOString().slice(0, 10)); }
    if (query.date_to)
      { conditions.push('DATE(al.created_at) <= ?');
        params.push(new Date(query.date_to).toISOString().slice(0, 10)); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim   = parseInt(limit,  10);
    const off   = parseInt(offset, 10);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM accounting_sync_logs al ${where}`, params
    );

    /* FIX: pool.query() + interpolated LIMIT/OFFSET — avoids ER_WRONG_ARGUMENTS */
    const [rows] = await pool.query(
      `SELECT
         al.id, al.reference_type, al.reference_id,
         al.provider, al.status, al.external_id,
         al.error_message, al.synced_at, al.created_at,
         o.order_number, o.uuid AS order_uuid,
         o.total_amount, o.channel
       FROM accounting_sync_logs al
       LEFT JOIN orders o
         ON o.id = al.reference_id AND al.reference_type = 'order'
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return {
      logs: rows.map((r) => ({
        id:             r.id,
        reference_type: r.reference_type,
        provider:       r.provider,
        status:         r.status,
        external_id:    r.external_id,
        error_message:  r.error_message,
        synced_at:      r.synced_at,
        created_at:     r.created_at,
        order:          r.order_uuid ? {
          id:           r.order_uuid,
          order_number: r.order_number,
          total_amount: parseFloat(r.total_amount),
          channel:      r.channel,
        } : null,
      })),
      meta: buildPaginationMeta(countRows[0].total, page, limit),
    };
  },

  /**
   * Summary counts for admin dashboard badge.
   */
  async getSyncSummary() {
    const [rows] = await pool.execute(
      `SELECT
         SUM(status = 'pending') AS pending,
         SUM(status = 'success') AS success,
         SUM(status = 'failed')  AS failed,
         COUNT(*)                AS total
       FROM accounting_sync_logs`
    );
    const r = rows[0];

    /* Also count orders not yet in sync logs (never attempted) */
    const [[{ unattempted }]] = await pool.execute(
      `SELECT COUNT(*) AS unattempted
         FROM orders
         WHERE status IN ('completed','ready')
           AND is_synced_to_accounting = 0`
    );

    return {
      provider:    env.accounting.provider,
      pending:     parseInt(r.pending,  10) || 0,
      success:     parseInt(r.success,  10) || 0,
      failed:      parseInt(r.failed,   10) || 0,
      unattempted: parseInt(unattempted, 10) || 0,
      total:       parseInt(r.total,    10) || 0,
    };
  },

  /**
   * Manually refresh Zoho OAuth token — for credential verification.
   */
  async refreshZohoToken() {
    if (env.accounting.provider !== 'zoho')
      throw new AppError(
        'Token refresh is only supported for the Zoho provider.',
        400, 'UNSUPPORTED_PROVIDER'
      );
    zohoTokenCache = { accessToken: null, expiresAt: 0 };
    await getZohoAccessToken();
    return {
      provider:       'zoho',
      token_obtained: true,
      expires_at:     new Date(zohoTokenCache.expiresAt).toISOString(),
    };
  },
};

module.exports = { accountingService };