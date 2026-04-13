const { body, param, query } = require('express-validator');

const toggleFavouriteSchema = [
  body('item_type').isIn(['style', 'fabric', 'tailor']).withMessage('item_type must be style, fabric, or tailor'),
  body('item_id').isUUID().withMessage('Valid item_id is required'),
];

const listFavouritesSchema = [
  query('type').optional().isIn(['style', 'fabric', 'tailor']).withMessage('Invalid type filter'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

module.exports = {
  toggleFavouriteSchema,
  listFavouritesSchema,
};
