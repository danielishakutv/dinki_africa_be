const { body, param, query } = require('express-validator');

const createCustomerSchema = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required (max 100 chars)'),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('email').optional().trim().isEmail().withMessage('Invalid email'),
  body('location').optional().trim().isLength({ max: 200 }),
];

const linkCustomerSchema = [
  body('user_id').isUUID().withMessage('Valid user ID is required'),
];

const updateCustomerSchema = [
  body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name max 100 chars'),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('email').optional().trim().isEmail().withMessage('Invalid email'),
  body('location').optional().trim().isLength({ max: 200 }),
];

const updateMeasurementsSchema = [
  // Accept any measurement keys as the frontend sends dynamic fields
  body('notes').optional().trim().isLength({ max: 1000 }),
];

const addCustomFieldSchema = [
  body('key').trim().isLength({ min: 1, max: 50 }).withMessage('Key is required')
    .matches(/^[a-z0-9_]+$/).withMessage('Key must be lowercase alphanumeric with underscores'),
  body('label').trim().isLength({ min: 1, max: 100 }).withMessage('Label is required'),
  body('unit').optional().trim().isLength({ max: 20 }),
  body('value').isFloat({ min: 0 }).withMessage('Value must be a positive number'),
];

const listCustomersSchema = [
  query('search').optional().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  createCustomerSchema,
  linkCustomerSchema,
  updateCustomerSchema,
  updateMeasurementsSchema,
  addCustomFieldSchema,
  listCustomersSchema,
};
