'use strict';



const logger = require('../../utils/logger');

const IS_CONFIGURED = Boolean(
  process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN
);

const whatsappService = {

  async sendOrderConfirmation(order) {
    const mobile = order.customer?.mobile;
    if (!mobile) return;

    const message = _buildConfirmationMessage(order);
    await _send(mobile, message, 'order_confirmation');
  },

 
  async sendOrderReady(order) {
    const mobile = order.customer?.mobile;
    if (!mobile) return;

    const message = _buildReadyMessage(order);
    await _send(mobile, message, 'order_ready');

    const feedbackMessage = _buildFeedbackMessage(order);
    await _send(mobile, feedbackMessage, 'feedback_request');
  },


  async sendCustomDrinkShare(order, customDrink) {
    const mobile = order.customer?.mobile;
    if (!mobile) return;

    const message = _buildCustomDrinkShareMessage(order, customDrink);
    await _send(mobile, message, 'custom_drink_share');
  },
};

/* ─── Message builders ────────────────────────────────────────────────────── */

function _buildConfirmationMessage(order) {
  return (
    `Hi ${order.customer?.name || 'there'}! ☕\n` +
    `Your order *#${order.order_number}* has been placed successfully.\n` +
    `Total: ₹${order.financials.total_amount}\n` +
    `We'll notify you when it's ready!`
  );
}

function _buildReadyMessage(order) {
  return (
    `Your order *#${order.order_number}* is ready! 🎉\n` +
    `Please collect it from the counter.\n` +
    `Thank you for choosing us, ${order.customer?.name || ''}!`
  );
}

function _buildFeedbackMessage(order) {
  return (
    `How was your experience with order *#${order.order_number}*?\n` +
    `Reply with a number: 1 (Poor) → 5 (Excellent)\n` +
    `Your feedback helps us improve! 🙏`
  );
}

function _buildCustomDrinkShareMessage(order, customDrink) {
  return (
    `${order.customer?.name || 'A customer'} just created their own drink — ` +
    `*${customDrink.name}* — at ${order.store?.name}! ☕\n` +
    `Crafted with love. Try it at your next visit.`
  );
}


async function _send(to, message, type) {
  if (!IS_CONFIGURED) {
    logger.info(
      `[WhatsApp STUB] Would send "${type}" to ${to}:\n${message}`
    );
    return;
  }

  /* ── Real implementation (uncomment & adapt when credentials are ready) ──
   *
   * const response = await fetch(process.env.WHATSAPP_API_URL, {
   *   method: 'POST',
   *   headers: {
   *     'Content-Type':  'application/json',
   *     'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
   *   },
   *   body: JSON.stringify({
   *     messaging_product: 'whatsapp',
   *     to,
   *     type: 'text',
   *     text: { body: message },
   *   }),
   * });
   *
   * if (!response.ok) {
   *   const err = await response.text();
   *   throw new Error(`WhatsApp API error (${response.status}): ${err}`);
   * }
   *
   * logger.info(`[WhatsApp] Sent "${type}" to ${to}`);
   */
}

module.exports = { whatsappService };