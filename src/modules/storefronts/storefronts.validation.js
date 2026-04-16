const { body, param, query } = require('express-validator');

const slugParam = [
  param('slug').trim().matches(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/).withMessage('Invalid storefront slug'),
];

const portfolioParam = [
  param('id').isUUID().withMessage('Invalid portfolio item ID'),
];

const listReviewsSchema = [
  ...slugParam,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

const updateStorefrontSchema = [
  body('bio').optional().isString().isLength({ max: 2000 }).withMessage('Bio must be under 2000 characters'),
  body('slug').optional().trim().matches(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/).isLength({ min: 3, max: 50 }).withMessage('Slug must be 3-50 characters, URL-friendly'),
  body('image').optional().isString().isLength({ max: 500 }),
  body('response_time').optional().isString().isLength({ max: 30 }),
  body('start_price').optional().isInt({ min: 0 }).toInt(),
  body('years_experience').optional().isInt({ min: 0, max: 80 }).toInt(),
  body('cover_position').optional().isString().isLength({ max: 50 }).withMessage('Cover position must be under 50 characters'),
];

const addPortfolioSchema = [
  body('title').trim().notEmpty().isLength({ max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('image_url').trim().notEmpty().isURL().withMessage('Valid image URL is required'),
  body('display_order').optional().isInt({ min: 0 }).toInt(),
];

module.exports = {
  slugParam,
  portfolioParam,
  listReviewsSchema,
  updateStorefrontSchema,
  addPortfolioSchema,
};
