const { body, param, query } = require('express-validator');

/**
 * POST /v1/admin/notifications/broadcast
 *
 * Body:
 *   target:  { scope: 'all' }
 *          | { scope: 'role', role: 'customer' | 'tailor' }
 *          | { scope: 'user', userId: '<uuid>' }
 *   title:   string (3–200)
 *   message: string (1–2000) (optional — title alone is allowed)
 *   link:    string (optional — stored in metadata.link, used by FE on click)
 */
const broadcastSchema = [
  body('target').isObject().withMessage('target is required'),
  body('target.scope')
    .isIn(['all', 'role', 'user']).withMessage("target.scope must be 'all', 'role', or 'user'"),
  body('target.role')
    .if(body('target.scope').equals('role'))
    .isIn(['customer', 'tailor']).withMessage("target.role must be 'customer' or 'tailor'"),
  body('target.userId')
    .if(body('target.scope').equals('user'))
    .isUUID().withMessage('target.userId must be a UUID'),

  body('title')
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('title must be 3–200 characters'),
  body('message')
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 2000 }).withMessage('message must be ≤ 2000 characters'),
  body('link')
    .optional({ checkFalsy: true })
    .isString()
    .isLength({ max: 500 }).withMessage('link must be ≤ 500 characters'),
];

/* ---------------- User management ---------------- */

const listUsersSchema = [
  query('q').optional().isString().isLength({ max: 100 }),
  query('role').optional().isIn(['all', 'customer', 'tailor', 'admin', 'superadmin'])
    .withMessage('role must be all|customer|tailor|admin|superadmin'),
  query('status').optional().isIn(['all', 'active', 'inactive'])
    .withMessage('status must be all|active|inactive'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

const userIdParam = [
  param('id').isUUID().withMessage('Invalid user id'),
];

const updateUserSchema = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 20 }),
  body('username').optional({ checkFalsy: true })
    .trim()
    .matches(/^[a-z0-9_.]{3,30}$/i)
    .withMessage('Username must be 3-30 chars (letters, numbers, _ or .)'),
  body('email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('is_active').optional().isBoolean(),
  body('role').optional().isIn(['customer', 'tailor', 'admin', 'superadmin'])
    .withMessage('role must be customer|tailor|admin|superadmin'),
];

const setPasswordSchema = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
];

const hardDeleteSchema = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('confirmEmail')
    .trim()
    .notEmpty().withMessage('confirmEmail is required')
    .isEmail().withMessage('confirmEmail must be a valid email')
    .normalizeEmail(),
];

module.exports = {
  broadcastSchema,
  listUsersSchema,
  userIdParam,
  updateUserSchema,
  setPasswordSchema,
  hardDeleteSchema,
};
