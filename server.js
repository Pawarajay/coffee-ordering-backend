'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');

const app    = require('./src/app');
const env    = require('./src/config/env');
const logger = require('./src/utils/logger');
const { connectDB, disconnectDB } = require('./src/config/db');

/* ── Cron imports — started AFTER DB connects ────────────────────────────── */
const { startInventoryCrons }  = require('./src/modules/inventory/inventory.cron');
const { startAccountingCrons } = require('./src/modules/accounting/accounting.cron');
const { startProductionCrons } = require('./src/modules/production/production.cron');

let server;
let wss;


function initWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    logger.debug(`[WS] Client connected from ${ip}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === 'subscribe') {
          ws.storeId = msg.store_id;
          ws.role    = msg.role || 'barista';
          logger.debug(`[WS] Client subscribed — store: ${ws.storeId}, role: ${ws.role}`);
          ws.send(JSON.stringify({
            event: 'subscribed',
            data:  { store_id: ws.storeId, role: ws.role },
          }));
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ event: 'pong' }));
        }
      } catch (_) {}
    });

    ws.on('close', () => {
      logger.debug(`[WS] Client disconnected (store: ${ws.storeId || 'unsubscribed'})`);
    });
    ws.on('error', (err) => {
      logger.warn(`[WS] Client error: ${err.message}`);
    });
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));

  global.__wss = wss;
  logger.info('[WS] WebSocket server initialised at ws://host/ws');
  return wss;
}


async function gracefulShutdown(signal) {
  logger.info(`[Server] Received ${signal}. Initiating graceful shutdown...`);

  if (wss) {
    wss.clients.forEach((ws) => ws.close(1001, 'Server shutting down'));
    wss.close(() => logger.info('[Server] WebSocket server closed.'));
  }

  if (server) {
    server.close(async () => {
      logger.info('[Server] HTTP server closed.');
      await disconnectDB();
      logger.info('[Server] DB disconnected. Shutdown complete.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('[Server] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 15_000);
  } else {
    process.exit(0);
  }
}


async function bootstrap() {
  try {
    await connectDB();
    logger.info('[Server] Database connected.');

    server = http.createServer(app);

    initWebSocket(server);

    startInventoryCrons();
    startAccountingCrons();
    startProductionCrons();
    logger.info('[Server] Cron jobs started.');

    server.listen(env.PORT, () => {
      logger.info(`[Server] ${env.APP_NAME} running in ${env.NODE_ENV} mode on port ${env.PORT}`);
      logger.info(`[Server] Health  : http://localhost:${env.PORT}/health`);
      logger.info(`[Server] API     : http://localhost:${env.PORT}/api/v1`);
      logger.info(`[Server] WS      : ws://localhost:${env.PORT}/ws`);
    });

    server.on('error', (err) => {
      logger.error('[Server] HTTP server error:', err);
      process.exit(1);
    });

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

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