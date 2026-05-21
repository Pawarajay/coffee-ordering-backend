'use strict';

const axios = require('axios');
const env = require('../config/env');
const logger = require('./logger');


/**
 * Send an OTP SMS via MSG91.
 * @param {string} mobileNumber  - E.164 format without '+' (e.g. "919876543210")
 * @param {string} otp
 */
async function sendViaMSG91(mobileNumber, otp) {
  const url = 'https://control.msg91.com/api/v5/otp';

  const payload = {
    template_id: env.sms.msg91TemplateId,
    mobile: mobileNumber,
    authkey: env.sms.msg91AuthKey,
    otp,
  };

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 8000,
  });

  if (response.data?.type !== 'success') {
    throw new Error(`MSG91 API error: ${JSON.stringify(response.data)}`);
  }

  return response.data;
}

/**
 * Primary SMS send function — routes to the configured provider.
 *
 * @param {string} mobileNumber  - 10-digit Indian mobile number (will be prefixed with 91)
 * @param {string} otp
 * @returns {Promise<{sent: boolean, bypass: boolean}>}
 */
async function sendOTPSMS(mobileNumber, otp) {
  // Normalize — strip +, leading 0, and ensure 91 prefix for MSG91
  const normalized = mobileNumber.replace(/^\+/, '').replace(/^0/, '');
  const e164 = normalized.startsWith('91') ? normalized : `91${normalized}`;

  // Bypass mode: log OTP to console, skip actual SMS
  if (env.otp.bypass) {
    logger.warn(`[SMS BYPASS] OTP for ${e164}: ${otp}`);
    return { sent: true, bypass: true };
  }

  try {
    switch (env.sms.provider) {
      case 'msg91':
        await sendViaMSG91(e164, otp);
        break;
      default:
        throw new Error(`Unknown SMS provider: ${env.sms.provider}`);
    }

    logger.info(`[SMS] OTP sent successfully to ${e164}`);
    return { sent: true, bypass: false };
  } catch (err) {
    logger.error(`[SMS] Failed to send OTP to ${e164}:`, err.message);
    throw err;
  }
}

module.exports = { sendOTPSMS };