const { body } = require('express-validator');

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

module.exports = { broadcastSchema };
