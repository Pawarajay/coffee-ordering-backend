'use strict';

const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const env = require('../config/env');

const { combine, timestamp, printf, colorize, errors, json } = format;

const consoleFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack || message}`;
});

const fileRotateTransport = new transports.DailyRotateFile({
  dirname: path.resolve(env.log.dir),
  filename: 'toof-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

const errorRotateTransport = new transports.DailyRotateFile({
  dirname: path.resolve(env.log.dir),
  filename: 'toof-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

const logger = createLogger({
  level: env.log.level,
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
  transports: [fileRotateTransport, errorRotateTransport],
  exitOnError: false,
});

if (!env.IS_PRODUCTION) {
  logger.add(
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      ),
    })
  );
}

logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;