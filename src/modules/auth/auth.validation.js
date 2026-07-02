const { body } = require('express-validator');
const { phoneBody } = require('../../utils/phone');

const signupSchema = [
  // Email and phone are each optional, but at least one is required (checked below).
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),
  phoneBody('phone'), // optional; validates + normalizes to +234… (or null)
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('role')
    .isIn(['customer', 'tailor']).withMessage('Role must be customer or tailor'),
  body('referralCode')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[A-Za-z0-9_-]{4,20}$/).withMessage('Invalid referral code'),
  // Require at least one identifier (runs after phone is normalized above).
  body().custom((_value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error('Enter an email address or phone number');
    }
    return true;
  }),
];

const loginSchema = [
  body('identifier').optional({ checkFalsy: true }).trim(),
  body('email').optional({ checkFalsy: true }).trim(),
  body('password').notEmpty().withMessage('Password is required'),
  body().custom((_value, { req }) => {
    if (!req.body.identifier && !req.body.email) {
      throw new Error('Enter your email or phone number');
    }
    return true;
  }),
];

const verifyEmailTokenSchema = [
  body('token').trim().notEmpty().withMessage('Verification token is required'),
];

const forgotPasswordSchema = [
  body('email')
    .trim()
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
];

const resetPasswordSchema = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
];

const changePasswordSchema = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
];

const activateSchema = [
  body('user_id')
    .isUUID().withMessage('Valid user ID is required'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Enter a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
];

module.exports = {
  signupSchema,
  loginSchema,
  verifyEmailTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  activateSchema,
};
