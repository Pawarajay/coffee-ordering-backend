'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const logger = require('./utils/logger');
const { generalLimiter } = require('./middlewares/rateLimiter.middleware');
const { notFoundHandler, globalErrorHandler } = require('./middlewares/error.middleware');

// ── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes       = require('./modules/auth/auth.routes');
const productRoutes    = require('./modules/products/product.routes');
const ingredientRoutes = require('./modules/ingredients/ingredient.routes');
const orderRoutes      = require('./modules/orders/order.routes');
const kotRoutes        = require('./modules/kot/kot.routes');
const baristaRoutes    = require('./modules/barista/barista.routes');
const inventoryRoutes   = require('./modules/inventory/inventory.routes');
const productionRoutes  = require('./modules/production/production.routes');
const customDrinkRoutes = require('./modules/customDrinks/customDrink.routes');
const storeRoutes           = require('./modules/stores/store.routes');
const personalizationRoutes = require('./modules/personalization/personalization.routes');
const reportsRoutes         = require('./modules/reports/reports.routes');
const d2cRoutes             = require('./modules/d2c/d2c.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const { startInventoryCrons }   = require('./modules/inventory/inventory.cron');
const { startAccountingCrons }  = require('./modules/accounting/accounting.cron');
const { startProductionCrons }  = require('./modules/production/production.cron');


const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.IS_PRODUCTION
      ? [
          'https://localhost:3000',
        ]
      : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.use(compression());

app.use(
  morgan(env.IS_PRODUCTION ? 'combined' : 'dev', {
    stream: logger.stream,
  })
);

app.set('trust proxy', 1);

app.use(generalLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    app: env.APP_NAME,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

const API_PREFIX = '/api/v1';

app.use(`${API_PREFIX}/auth`,        authRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}`,             productRoutes);   
app.use(`${API_PREFIX}`,             ingredientRoutes); 
app.use(`${API_PREFIX}/orders`,      orderRoutes);
app.use(`${API_PREFIX}/kot`,         kotRoutes);
app.use(`${API_PREFIX}/barista`,     baristaRoutes);
app.use(`${API_PREFIX}/inventory`,      inventoryRoutes);
app.use(`${API_PREFIX}/production`,     productionRoutes);
app.use(`${API_PREFIX}/custom-drinks`,  customDrinkRoutes);
app.use(`${API_PREFIX}/stores`,         storeRoutes);
app.use(`${API_PREFIX}/me`,             personalizationRoutes);
app.use(`${API_PREFIX}/reports`,        reportsRoutes);
app.use(`${API_PREFIX}/d2c`,            d2cRoutes);


app.use(notFoundHandler);

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(globalErrorHandler);
startInventoryCrons();
startAccountingCrons();
startProductionCrons();
module.exports = app;