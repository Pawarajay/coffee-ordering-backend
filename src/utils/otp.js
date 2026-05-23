'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../config/env');

function generateOTP() {
  const max = Math.pow(10, env.otp.length);
  const otp = crypto.randomInt(0, max);
  return String(otp).padStart(env.otp.length, '0');
}


async function hashOTP(otp) {
  return bcrypt.hash(otp, 10);
}


async function verifyOTP(otp, hash) {
  return bcrypt.compare(otp, hash);
}


function getOTPExpiry() {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + env.otp.expiryMinutes);
  return expiry;
}


function isOTPExpired(expiresAt) {
  return new Date() > new Date(expiresAt);
}

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiry,
  isOTPExpired,
};