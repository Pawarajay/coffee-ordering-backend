'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDB, disconnectDB } = require('./src/config/db');

let server;


async function gracefulShutdown(signal) {
  logger.info(`[Server] Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('[Server] HTTP server closed.');
      await disconnectDB();
      logger.info('[Server] Shutdown complete.');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 15000);
  } else {
    process.exit(0);
  }
}


async function bootstrap() {
  try {
    await connectDB();

    server = app.listen(env.PORT, () => {
      logger.info(
        `[Server] ${env.APP_NAME} running in ${env.NODE_ENV} mode on port ${env.PORT}`
      );
      logger.info(`[Server] Health check: http://localhost:${env.PORT}/health`);
      logger.info(`[Server] API base: http://localhost:${env.PORT}/api/v1`);
    });

    server.on('error', (err) => {
      logger.error('[Server] HTTP server error:', err);
      process.exit(1);
    });

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('[Server] Unhandled Promise Rejection:', reason);
      if (env.IS_PRODUCTION) gracefulShutdown('unhandledRejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error('[Server] Uncaught Exception:', err);
      gracefulShutdown('uncaughtException');
    });
  } catch (err) {
    logger.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();