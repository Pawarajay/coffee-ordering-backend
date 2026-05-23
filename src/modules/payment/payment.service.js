'use strict';


const crypto  = require('crypto');
const logger  = require('../../utils/logger');

const IS_CONFIGURED = Boolean(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
);

function getRazorpayInstance() {
  const Razorpay = require('razorpay');
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

const paymentService = {
 
  async createGatewayOrder({ amount, currency = 'INR', receipt, method }) {
    if (!IS_CONFIGURED) {
      const stubId = `stub_order_${receipt}_${Date.now()}`;
      logger.info(
        `[Payment STUB] Would create Razorpay order — ₹${amount} ${currency} | receipt: ${receipt} | method: ${method}`
      );
      return {
        id:  stubId,
        key: 'rzp_test_STUB_KEY',     
      };
    }

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100), 
      currency,
      receipt:  receipt.slice(0, 40),     
      payment_capture: 1,
    });

    logger.info(`[Payment] Razorpay order created: ${order.id} — ₹${amount}`);

    return {
      id:  order.id,
      key: process.env.RAZORPAY_KEY_ID,
    };
  },

 
  async verifySignature({ gateway_order_id, gateway_payment_id, gateway_signature }) {
    if (!IS_CONFIGURED) {
      logger.info(
        `[Payment STUB] Would verify signature for payment ${gateway_payment_id}`
      );
      return true;
    }

    if (!gateway_order_id || !gateway_payment_id || !gateway_signature) {
      return true;
    }

    const body      = `${gateway_order_id}|${gateway_payment_id}`;
    const expected  = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expected !== gateway_signature) {
      throw new Error('Payment signature verification failed. Possible tampered response.');
    }

    logger.info(`[Payment] Signature verified for payment ${gateway_payment_id}`);
    return true;
  },
};

module.exports = { paymentService };