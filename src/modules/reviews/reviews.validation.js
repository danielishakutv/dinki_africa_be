const { body, param } = require('express-validator');

const createReviewSchema = [
  body('order_id').isUUID().withMessage('Valid order ID is required'),
  body('rating').isInt({ min: 1, max: 5 }).toInt().withMessage('Rating must be 1-5'),
  body('text').optional().isString().isLength({ max: 2000 }).withMessage('Review text max 2000 characters'),
];

const reviewIdParam = [
  param('id').isUUID().withMessage('Invalid review ID'),
];

module.exports = {
  createReviewSchema,
  reviewIdParam,
};
