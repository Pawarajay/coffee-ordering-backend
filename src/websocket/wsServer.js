'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');


const ALLOWED_ROLES = ['barista', 'store_manager', 'admin', 'super_admin'];

const rooms = new Map();

let wss = null;


function addToRoom(storeId, ws) {
  if (!rooms.has(storeId)) rooms.set(storeId, new Set());
  rooms.get(storeId).add(ws);
}

function removeFromRoom(storeId, ws) {
  if (rooms.has(storeId)) {
    rooms.get(storeId).delete(ws);
    if (rooms.get(storeId).size === 0) rooms.delete(storeId);
  }
}

function send(ws, type, payload = null) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, ts: new Date().toISOString() }));
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Broadcast an event to all connected baristas in a store room.
 * Called from order.service and kot.service after state changes.
 *
 * @param {number|string} storeId
 * @param {string} type    — Event type constant (NEW_ORDER, KOT_UPDATE, etc.)
 * @param {object} payload — Event data
 */
function broadcast(storeId, type, payload) {
  const room = rooms.get(Number(storeId));
  if (!room || room.size === 0) return;

  const message = JSON.stringify({ type, payload, ts: new Date().toISOString() });

  let sent = 0;
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  }

  logger.info(`[WS] Broadcast "${type}" to store ${storeId} — ${sent} client(s).`);
}

/**
 * Attach WebSocket server to an existing HTTP server instance.
 * Called once from server.js after the HTTP server starts.
 *
 * @param {import('http').Server} httpServer
 */
function initWebSocket(httpServer) {
  wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
  });

  logger.info('[WS] WebSocket server initialised on path /ws');

  const HEARTBEAT_INTERVAL = 30_000;
  const heartbeatTimer = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        logger.warn('[WS] Terminating stale connection.');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => clearInterval(heartbeatTimer));

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.storeId = null;
    ws.userId  = null;

    let token;
    try {
      const url   = new URL(req.url, `http://${req.headers.host}`);
      token       = url.searchParams.get('token');
    } catch {
      send(ws, 'ERROR', { message: 'Malformed connection URL.' });
      return ws.terminate();
    }

    if (!token) {
      send(ws, 'ERROR', { message: 'Authentication token required.' });
      return ws.terminate();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.secret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.';
      send(ws, 'ERROR', { message: msg });
      return ws.terminate();
    }

    if (!ALLOWED_ROLES.includes(decoded.role)) {
      send(ws, 'ERROR', { message: 'Access denied. Barista/Manager role required.' });
      return ws.terminate();
    }

    let url2;
    try { url2 = new URL(req.url, `http://${req.headers.host}`); } catch { url2 = null; }

    const storeId = decoded.storeId
      || (url2 ? parseInt(url2.searchParams.get('storeId'), 10) : null);

    if (!storeId) {
      send(ws, 'ERROR', { message: 'storeId could not be determined from your token.' });
      return ws.terminate();
    }

    ws.isAlive = true;
    ws.storeId = storeId;
    ws.userId  = decoded.sub;

    addToRoom(storeId, ws);

    logger.info(
      `[WS] User ${decoded.sub} (${decoded.role}) connected to store ${storeId} room. ` +
      `Room size: ${rooms.get(storeId).size}`
    );

    send(ws, 'CONNECTED', {
      message: `Connected to store ${storeId} real-time feed.`,
      store_id: storeId,
    });

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'PING') {
        send(ws, 'PONG');
      }
    });

    ws.on('close', () => {
      removeFromRoom(storeId, ws);
      logger.info(`[WS] User ${ws.userId} disconnected from store ${storeId} room.`);
    });

    ws.on('error', (err) => {
      logger.error(`[WS] Socket error for user ${ws.userId}:`, err.message);
      removeFromRoom(storeId, ws);
    });
  });

  return wss;
}


function getStats() {
  const storeStats = {};
  for (const [storeId, clients] of rooms.entries()) {
    storeStats[storeId] = clients.size;
  }
  return {
    total_connections: wss ? wss.clients.size : 0,
    stores: storeStats,
  };
}


const WS_EVENTS = Object.freeze({
  NEW_ORDER:     'NEW_ORDER',     
  KOT_UPDATE:    'KOT_UPDATE',     
  ORDER_STATUS:  'ORDER_STATUS',  
  STOCK_ALERT:   'STOCK_ALERT',    
  CONNECTED:     'CONNECTED',
  PING:          'PING',
  PONG:          'PONG',
  ERROR:         'ERROR',
});

module.exports = { initWebSocket, broadcast, getStats, WS_EVENTS };