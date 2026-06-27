const { body, param } = require('express-validator');

const idParam = [
  param('id').isUUID().withMessage('Invalid share id'),
];

const tokenParam = [
  param('token').isString().isLength({ min: 6, max: 24 }).withMessage('Invalid link'),
];

const createSchema = [
  body('title').optional().isString().isLength({ max: 120 }),
  body('measurements').optional().isObject().withMessage('measurements must be an object'),
  body('unit').optional().isString().isLength({ max: 8 }),
];

const updateSchema = [
  ...idParam,
  body('title').optional().isString().isLength({ max: 120 }),
  body('measurements').optional().isObject(),
  body('unit').optional().isString().isLength({ max: 8 }),
  body('is_public').optional().isBoolean(),
];

module.exports = { idParam, tokenParam, createSchema, updateSchema };
