'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Response = require('../utils/response');
const { pool } = require('../config/db');


async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.unauthorized(res, 'Authorization token required.');
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, env.jwt.secret);

    const [rows] = await pool.execute(
      `SELECT id, mobile, role, store_id, is_active
         FROM users
        WHERE id = ? AND is_active = 1
        LIMIT 1`,
      [decoded.sub]
    );

    if (!rows.length) {
      return Response.unauthorized(res, 'User not found or inactive.');
    }

    const user = rows[0];
    req.user = {
      id: user.id,
      mobile: user.mobile,
      role: user.role,
      storeId: user.store_id,
    };

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return Response.unauthorized(res, 'Token expired. Please log in again.');
    }
    if (err.name === 'JsonWebTokenError') {
      return Response.unauthorized(res, 'Invalid token.');
    }
    return next(err);
  }
}


async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.jwt.secret);

    const [rows] = await pool.execute(
      `SELECT id, mobile, role, store_id FROM users WHERE id = ? AND is_active = 1 LIMIT 1`,
      [decoded.sub]
    );

    req.user = rows.length ? rows[0] : null;
    return next();
  } catch {
    req.user = null;
    return next();
  }
}

module.exports = { authenticate, optionalAuthenticate };