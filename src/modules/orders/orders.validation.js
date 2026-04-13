const { body, param, query } = require('express-validator');

const orderIdParam = [
  param('id').isUUID().withMessage('Invalid order ID'),
];

const createOrderSchema = [
  body('tailor_id').isUUID().withMessage('Valid tailor ID is required'),
  body('title').trim().notEmpty().isLength({ max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('description').optional().isString().isLength({ max: 2000 }),
  body('budget').optional().isInt({ min: 0 }).toInt().withMessage('Budget must be a positive integer (kobo)'),
  body('due_date').optional().isISO8601().toDate().withMessage('Valid due date is required'),
  body('fabric_preference').optional().isString().isLength({ max: 100 }),
  body('measurement_notes').optional().isString().isLength({ max: 1000 }),
  body('style_id').optional().isUUID().withMessage('Invalid style ID'),
];

const listOrdersSchema = [
  query('status').optional().isIn(['pending', 'accepted', 'in_progress', 'completed', 'cancelled']).withMessage('Invalid status'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

const declineOrderSchema = [
  ...orderIdParam,
  body('reason').trim().notEmpty().isLength({ max: 500 }).withMessage('Decline reason is required (max 500 chars)'),
];

module.exports = {
  orderIdParam,
  createOrderSchema,
  listOrdersSchema,
  declineOrderSchema,
};
