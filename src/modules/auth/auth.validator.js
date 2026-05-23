'use strict';

const Joi = require('joi');

const mobileSchema = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({
    'string.pattern.base': 'Mobile number must be a valid 10-digit Indian mobile number.',
    'any.required': 'Mobile number is required.',
  });

const authValidator = {

  sendOTP: Joi.object({
    mobile: mobileSchema,
  }),

  loginEmail: Joi.object({
    email: Joi.string().email().required().messages({
      'any.required': 'Email is required.',
      'string.email': 'Invalid email format.'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required.'
    })
  }),

  
  verifyOTP: Joi.object({
    mobile: mobileSchema,
    otp: Joi.string()
      .length(6)
      .pattern(/^\d+$/)
      .required()
      .messages({
        'string.length': 'OTP must be exactly 6 digits.',
        'string.pattern.base': 'OTP must contain only digits.',
        'any.required': 'OTP is required.',
      }),
  }),


  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required.',
    }),
  }),

 
  logout: Joi.object({
    refreshToken: Joi.string().required(),
  }),


  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(150).optional(),
    email: Joi.string().email().lowercase().trim().optional(),
  }).min(1), // At least one field required
};

module.exports = authValidator;