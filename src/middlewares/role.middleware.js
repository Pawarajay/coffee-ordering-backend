'use strict';

const Response = require('../utils/response');
const { ROLES } = require('../config/constants');

/**
 * Role-based access control middleware factory.
 *
 * Usage (must be placed AFTER `authenticate`):
 *   router.get('/admin/users', authenticate, authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN), handler);
 *
 * @param {...string} allowedRoles - One or more roles that can access the route
 * @returns {import('express').RequestHandler}
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return Response.unauthorized(res, 'Authentication required.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return Response.forbidden(
        res,
        `Access denied. Required role(s): ${allowedRoles.join(', ')}.`
      );
    }

    return next();
  };
}


const isCustomer = authorize(ROLES.CUSTOMER);
const isBarista = authorize(ROLES.BARISTA, ROLES.STORE_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN);
const isStoreManager = authorize(ROLES.STORE_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN);
const isAdmin = authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN);
const isSuperAdmin = authorize(ROLES.SUPER_ADMIN);
const isStaff = authorize(ROLES.BARISTA, ROLES.STORE_MANAGER, ROLES.ADMIN, ROLES.SUPER_ADMIN);

module.exports = {
  authorize,
  isCustomer,
  isBarista,
  isStoreManager,
  isAdmin,
  isSuperAdmin,
  isStaff,
};