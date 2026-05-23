'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../../config/db');
const env = require('../../config/env');
const { generateOTP, hashOTP, verifyOTP, getOTPExpiry, isOTPExpired } = require('../../utils/otp');
const { sendOTPSMS } = require('../../utils/sms');
const { AppError } = require('../../middlewares/error.middleware');
const logger = require('../../utils/logger');

function issueAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      storeId: user.store_id || null,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}


function issueRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hash a raw refresh token for DB storage.
 * @param {string} rawToken
 */
function hashRefreshToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}


function getRefreshTokenExpiry() {
  const str = env.jwt.refreshExpiresIn; // e.g. "7d"
  const match = str.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid JWT_REFRESH_EXPIRES_IN: ${str}`);
  const [, amount, unit] = match;
  const ms = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }[unit];
  const expiry = new Date(Date.now() + parseInt(amount, 10) * ms);
  return expiry;
}


async function sendOTP(mobile) {
  const otp = generateOTP();
  const otpHash = await hashOTP(otp);
  const expiresAt = getOTPExpiry();

  await pool.execute(
    `UPDATE otp_tokens SET is_used = 1 WHERE mobile = ? AND is_used = 0`,
    [mobile]
  );

  await pool.execute(
    `INSERT INTO otp_tokens (mobile, otp_hash, expires_at) VALUES (?, ?, ?)`,
    [mobile, otpHash, expiresAt]
  );

  await sendOTPSMS(mobile, otp);

  logger.info(`[Auth] OTP sent to ${mobile}`);
  return { message: 'OTP sent successfully.' };
}

/**
 * STEP 2: Verify OTP, upsert user, return tokens.
 */
async function verifyOTPAndLogin(mobile, otp, meta = {}) {
  // Fetch the latest unused OTP for this mobile
  const [rows] = await pool.execute(
    `SELECT id, otp_hash, expires_at, is_used, attempt_count
       FROM otp_tokens
      WHERE mobile = ? AND is_used = 0
      ORDER BY created_at DESC
      LIMIT 1`,
    [mobile]
  );

  if (!rows.length) {
    throw new AppError('No active OTP found. Please request a new OTP.', 400, 'OTP_NOT_FOUND');
  }

  const record = rows[0];

  // Check expiry
  if (isOTPExpired(record.expires_at)) {
    await pool.execute(`UPDATE otp_tokens SET is_used = 1 WHERE id = ?`, [record.id]);
    throw new AppError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED');
  }

  // Increment attempt count before verifying (brute-force guard)
  await pool.execute(
    `UPDATE otp_tokens SET attempt_count = attempt_count + 1 WHERE id = ?`,
    [record.id]
  );

  // Max 5 attempts per OTP
  if (record.attempt_count >= 5) {
    await pool.execute(`UPDATE otp_tokens SET is_used = 1 WHERE id = ?`, [record.id]);
    throw new AppError('Maximum OTP attempts exceeded. Please request a new OTP.', 429, 'OTP_MAX_ATTEMPTS');
  }

  // Verify OTP
  const isValid = await verifyOTP(otp, record.otp_hash);
  if (!isValid) {
    throw new AppError('Invalid OTP. Please try again.', 400, 'OTP_INVALID');
  }

  // Mark OTP as used
  await pool.execute(`UPDATE otp_tokens SET is_used = 1 WHERE id = ?`, [record.id]);

  // Upsert user — create if new, fetch if existing
  const [upsertResult] = await pool.execute(
    `INSERT INTO users (mobile, role) VALUES (?, 'customer')
     ON DUPLICATE KEY UPDATE last_login_at = NOW(), id = LAST_INSERT_ID(id)`,
    [mobile]
  );

  const userId = upsertResult.insertId;

  // Fetch full user record
  const [userRows] = await pool.execute(
    `SELECT id, uuid, mobile, name, email, role, store_id, is_active
       FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  const user = userRows[0];

  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403, 'ACCOUNT_INACTIVE');
  }

  // Issue tokens
  const accessToken = issueAccessToken(user);
  const rawRefreshToken = issueRefreshToken();
  const refreshTokenHash = hashRefreshToken(rawRefreshToken);
  const refreshExpiry = getRefreshTokenExpiry();

  await pool.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, refreshTokenHash, refreshExpiry, meta.userAgent || null, meta.ip || null]
  );

  // Update last login
  await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

  logger.info(`[Auth] User ${user.id} (${mobile}) logged in successfully.`);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: env.jwt.accessExpiresIn,
    user: {
      id: user.uuid,
      mobile: user.mobile,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Login using Email and Password
 */
async function loginWithEmail(email, password, meta = {}) {
  // Fetch user by email
  const [rows] = await pool.execute(
    `SELECT id, uuid, mobile, name, email, role, store_id, is_active, password_hash
       FROM users WHERE email = ? LIMIT 1`,
    [email]
  );

  if (!rows.length) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  const user = rows[0];

  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403, 'ACCOUNT_INACTIVE');
  }

  if (!user.password_hash) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // Compare password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // Issue tokens
  const accessToken = issueAccessToken(user);
  const rawRefreshToken = issueRefreshToken();
  const refreshTokenHash = hashRefreshToken(rawRefreshToken);
  const refreshExpiry = getRefreshTokenExpiry();

  await pool.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [user.id, refreshTokenHash, refreshExpiry, meta.userAgent || null, meta.ip || null]
  );

  // Update last login
  await pool.execute(`UPDATE users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

  logger.info(`[Auth] User ${user.id} (${email}) logged in successfully via email/password.`);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: env.jwt.accessExpiresIn,
    user: {
      id: user.uuid,
      mobile: user.mobile,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * STEP 3 (optional): Refresh access token using a valid refresh token.
 */
async function refreshAccessToken(rawRefreshToken) {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const [rows] = await pool.execute(
    `SELECT rt.id, rt.expires_at, rt.is_revoked,
            u.id AS user_id, u.mobile, u.role, u.store_id, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
      WHERE rt.token_hash = ?
      LIMIT 1`,
    [tokenHash]
  );

  if (!rows.length) {
    throw new AppError('Invalid refresh token.', 401, 'REFRESH_TOKEN_INVALID');
  }

  const record = rows[0];

  if (record.is_revoked) {
    throw new AppError('Refresh token has been revoked. Please log in again.', 401, 'REFRESH_TOKEN_REVOKED');
  }

  if (new Date() > new Date(record.expires_at)) {
    throw new AppError('Refresh token has expired. Please log in again.', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  if (!record.is_active) {
    throw new AppError('Account is inactive.', 403, 'ACCOUNT_INACTIVE');
  }

  const user = {
    id: record.user_id,
    mobile: record.mobile,
    role: record.role,
    store_id: record.store_id,
  };

  const newAccessToken = issueAccessToken(user);

  return {
    accessToken: newAccessToken,
    expiresIn: env.jwt.accessExpiresIn,
  };
}

/**
 * Logout — revoke the provided refresh token.
 */
async function logout(rawRefreshToken) {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const [result] = await pool.execute(
    `UPDATE refresh_tokens SET is_revoked = 1 WHERE token_hash = ?`,
    [tokenHash]
  );

  if (result.affectedRows === 0) {
    throw new AppError('Refresh token not found.', 404, 'REFRESH_TOKEN_NOT_FOUND');
  }

  return { message: 'Logged out successfully.' };
}

/**
 * Update customer profile (name, email).
 */
async function updateProfile(userId, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }

  if (!fields.length) {
    throw new AppError('No fields to update.', 400);
  }

  values.push(userId);

  const [result] = await pool.execute(
    `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
    values
  );

  if (result.affectedRows === 0) {
    throw new AppError('User not found.', 404);
  }

  const [rows] = await pool.execute(
    `SELECT uuid, mobile, name, email, role FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  return rows[0];
}

module.exports = {
  sendOTP,
  verifyOTPAndLogin,
  refreshAccessToken,
  logout,
  updateProfile,
  loginWithEmail,
};