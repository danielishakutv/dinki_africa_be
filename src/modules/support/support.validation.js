const { body } = require('express-validator');

const CATEGORIES = [
  'Account Issue',
  'Payment Problem',
  'Job / Order Issue',
  'Technical Bug',
  'Feature Request',
  'Other',
];

const createTicketSchema = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('category').isIn(CATEGORIES).withMessage('Pick a valid category'),
  body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('Subject must be 3-200 characters'),
  body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('Message must be 10-5000 characters'),
];

module.exports = { createTicketSchema, CATEGORIES };
