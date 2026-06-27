const { body, param, query } = require('express-validator');

const idParam = [
  param('id').isUUID().withMessage('Invalid style id'),
];

const commentIdParam = [
  param('commentId').isUUID().withMessage('Invalid comment id'),
];

const listSchema = [
  query('category').optional().isString().isLength({ max: 40 }),
  query('tag').optional().isString().isLength({ max: 40 }),
  query('q').optional().isString().isLength({ max: 80 }),
  query('source_type').optional().isIn(['tailor', 'admin', 'external']),
  query('sort').optional().isIn(['recent', 'trending']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

const listCommentsSchema = [
  ...idParam,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

const addCommentSchema = [
  ...idParam,
  body('body').trim().notEmpty().isLength({ max: 1000 }).withMessage('Comment is required (max 1000 chars)'),
];

const createStyleSchema = [
  body('title').trim().notEmpty().isLength({ max: 200 }).withMessage('Title is required (max 200 chars)'),
  body('image_url').trim().notEmpty().isLength({ max: 1000 }).withMessage('Image URL is required'),
  body('thumb_url').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body('category').optional({ nullable: true }).isString().isLength({ max: 40 }),
  body('tags').optional({ nullable: true }).isArray({ max: 20 }),
  body('color').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('price').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('source_type').optional().isIn(['tailor', 'admin', 'external']),
  body('source_name').optional({ nullable: true }).isString().isLength({ max: 160 }),
  body('source_url').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('tailor_id').optional({ nullable: true }).isUUID(),
];

module.exports = {
  idParam,
  commentIdParam,
  listSchema,
  listCommentsSchema,
  addCommentSchema,
  createStyleSchema,
};
