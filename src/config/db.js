'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('../utils/logger');


const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: env.db.poolMax,
  queueLimit: 0,
  dateStrings: false,
  timezone: '+00:00',
  charset: 'utf8mb4',
  multipleStatements: false,
});


async function connectDB() {
  try {
    const connection = await pool.getConnection();
    logger.info(`[DB] Connected to MySQL — host: ${env.db.host}, db: ${env.db.name}`);
    connection.release();
  } catch (err) {
    logger.error('[DB] Failed to connect to MySQL:', err.message);
    throw err; 
  }
}


async function disconnectDB() {
  try {
    await pool.end();
    logger.info('[DB] MySQL pool closed gracefully.');
  } catch (err) {
    logger.error('[DB] Error closing MySQL pool:', err.message);
  }
}

module.exports = { pool, connectDB, disconnectDB };