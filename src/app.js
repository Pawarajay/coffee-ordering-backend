'use strict';

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const morgan      = require('morgan');

const env    = require('./config/env');
const logger = require('./utils/logger');
const { generalLimiter }                    = require('./middlewares/rateLimiter.middleware');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/error.middleware');

const authRoutes            = require('./modules/auth/auth.routes');
const productRoutes         = require('./modules/products/product.routes');
const ingredientRoutes      = require('./modules/ingredients/ingredient.routes');
const orderRoutes           = require('./modules/orders/order.routes');
const kotRoutes             = require('./modules/kot/kot.routes');
const baristaRoutes         = require('./modules/barista/barista.routes');
const inventoryRoutes       = require('./modules/inventory/inventory.routes');
const productionRoutes      = require('./modules/production/production.routes');
const customDrinkRoutes     = require('./modules/customDrinks/customDrink.routes');
const storeRoutes           = require('./modules/stores/store.routes');
const personalizationRoutes = require('./modules/personalization/personalization.routes');
const reportsRoutes         = require('./modules/reports/reports.routes');
const d2cRoutes             = require('./modules/d2c/d2c.routes');
const accountingRoutes      = require('./modules/accounting/accounting.routes');
const adminRoutes           = require('./modules/admin/admin.routes');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));


const PRODUCTION_ORIGINS = [
  process.env.KIOSK_URL  || 'http://localhost:3001',
  process.env.ADMIN_URL  || 'http://localhost:3002',
  process.env.D2C_URL    || 'http://localhost:3003',
  process.env.QR_URL     || 'http://localhost:3004',  
].filter(Boolean);

app.use(
  cors({
    origin: env.IS_PRODUCTION
      ? (origin, callback) => {
          /* Allow requests with no origin (mobile apps, Postman, curl) */
          if (!origin) return callback(null, true);
          if (PRODUCTION_ORIGINS.includes(origin)) return callback(null, true);
          logger.warn(`[CORS] Blocked origin: ${origin}`);
          return callback(new Error(`Origin ${origin} not allowed by CORS policy.`));
        }
      : '*',   /* Development — allow all origins */

    methods:       ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Session-Id',     /* D2C guest cart identity */
      'X-Store-Id',       /* Kiosk store context */
      'X-Request-Id',     /* Optional tracing header */
    ],
    exposedHeaders: [
      'Content-Disposition',  /* Needed for CSV export downloads */
    ],
    credentials: true,
    maxAge: 86400,            /* Cache preflight for 24 hours */
  })
);

/* ── Body parsing ────────────────────────────────────────────────────────── */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ── Compression ─────────────────────────────────────────────────────────── */
app.use(compression());

/* ── HTTP request logging ────────────────────────────────────────────────── */
app.use(
  morgan(env.IS_PRODUCTION ? 'combined' : 'dev', {
    stream: logger.stream,
  })
);

/* ── Trust proxy (required for rate limiter + real IP behind Nginx/ALB) ─── */
app.set('trust proxy', 1);

/* ── Rate limiting ───────────────────────────────────────────────────────── */
app.use(generalLimiter);

/* ── Health check ────────────────────────────────────────────────────────── */
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'ok',
    app:         env.APP_NAME,
    environment: env.NODE_ENV,
    timestamp:   new Date().toISOString(),
    uptime_sec:  Math.floor(process.uptime()),
  });
});

/* ── API routes ──────────────────────────────────────────────────────────── */
const API = '/api/v1';

app.use(`${API}/auth`,          authRoutes);
app.use(`${API}/admin`,         adminRoutes);
app.use(`${API}`,               productRoutes);       /* /products, /categories */
app.use(`${API}`,               ingredientRoutes);    /* /ingredients */
app.use(`${API}/orders`,        orderRoutes);
app.use(`${API}/kot`,           kotRoutes);
app.use(`${API}/barista`,       baristaRoutes);
app.use(`${API}/inventory`,     inventoryRoutes);
app.use(`${API}/production`,    productionRoutes);
app.use(`${API}/custom-drinks`, customDrinkRoutes);
app.use(`${API}/stores`,        storeRoutes);
app.use(`${API}/me`,            personalizationRoutes);
app.use(`${API}/reports`,       reportsRoutes);
app.use(`${API}/d2c`,           d2cRoutes);
app.use(`${API}/accounting`,    accountingRoutes);    /* FIX: was missing */

/* ── 404 + global error handler (must be last) ───────────────────────────── */
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;