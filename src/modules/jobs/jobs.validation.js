const { body, query } = require('express-validator');

const createJobSchema = [
  body('customer_id').isUUID().withMessage('Valid customer ID is required'),
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('style_image_url').optional().trim().isURL().withMessage('Must be a valid URL'),
  body('due_date').optional().isISO8601().withMessage('Must be ISO 8601 date'),
  body('price').optional().isInt({ min: 0 }).withMessage('Price must be a positive integer (kobo)'),
];

const updateJobSchema = [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('style_image_url').optional().trim().isURL(),
  body('due_date').optional().isISO8601(),
  body('price').optional().isInt({ min: 0 }),
];

const updateStatusSchema = [
  body('status').isIn(['cutting', 'stitching', 'ready', 'delivered']).withMessage('Invalid status'),
];

const toggleInvoiceSchema = [
  body('invoiced').isBoolean().withMessage('invoiced must be a boolean'),
];

const listJobsSchema = [
  query('status').optional().isIn(['cutting', 'stitching', 'ready', 'delivered']),
  query('overdue').optional().isBoolean().toBoolean(),
  query('search').optional().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createJobSchema,
  updateJobSchema,
  updateStatusSchema,
  toggleInvoiceSchema,
  listJobsSchema,
};
