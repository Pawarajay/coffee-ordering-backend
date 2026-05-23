'use strict';
const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  STORE_MANAGER: 'store_manager',
  BARISTA: 'barista',
  CUSTOMER: 'customer',
});

const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',          
  CONFIRMED: 'confirmed',      
  IN_PROGRESS: 'in_progress', 
  READY: 'ready',              
  COMPLETED: 'completed',      
  CANCELLED: 'cancelled',      
  REFUNDED: 'refunded',        
});

const KOT_STATUS = Object.freeze({
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  DONE: 'done',
  CANCELLED: 'cancelled',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

const PAYMENT_METHOD = Object.freeze({
  UPI: 'upi',
  CARD: 'card',
  CASH: 'cash',
  WALLET: 'wallet',
});

const ORDER_CHANNEL = Object.freeze({
  KIOSK: 'kiosk',
  QR_MOBILE: 'qr_mobile',
  D2C_WEBSITE: 'd2c_website',
  WHATSAPP: 'whatsapp',
  ADMIN: 'admin',
});

const INVENTORY_TXN_TYPE = Object.freeze({
  STOCK_IN: 'stock_in',           
  STOCK_OUT: 'stock_out',         
  ADJUSTMENT: 'adjustment',       
  WASTAGE: 'wastage',             
  TRANSFER: 'transfer',           
  PRODUCTION: 'production',       
});

const UNIT_TYPE = Object.freeze({
  ML: 'ml',
  GRAMS: 'g',
  PIECES: 'pcs',
  LITRES: 'l',
  KG: 'kg',
});

const PRODUCT_TYPE = Object.freeze({
  BEVERAGE: 'beverage',
  CONCENTRATE: 'concentrate',  
  FOOD: 'food',
  ADDON: 'addon',
});

const WA_TEMPLATE = Object.freeze({
  ORDER_CONFIRMATION: 'order_confirmation',
  ORDER_READY: 'order_ready',
  FEEDBACK_REQUEST: 'feedback_request',
  CUSTOM_DRINK_SHARE: 'custom_drink_share',
});

const TOKEN_TYPE = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
  OTP: 'otp',
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

const STOCK_ALERT = Object.freeze({
  LOW: 'low',
  CRITICAL: 'critical',
  OUT_OF_STOCK: 'out_of_stock',
});

module.exports = {
  ROLES,
  ORDER_STATUS,
  KOT_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  ORDER_CHANNEL,
  INVENTORY_TXN_TYPE,
  UNIT_TYPE,
  PRODUCT_TYPE,
  WA_TEMPLATE,
  TOKEN_TYPE,
  PAGINATION,
  STOCK_ALERT,
};