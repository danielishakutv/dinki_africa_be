const { body, param, query } = require('express-validator');

const notificationIdParam = [
  param('id').isUUID().withMessage('Invalid notification ID'),
];

const pushTokenSchema = [
  body('token').isString().trim().isLength({ min: 10, max: 500 }).withMessage('Valid push token required'),
  body('platform').optional().isIn(['android', 'ios', 'web']).withMessage('Platform must be android, ios or web'),
];

module.exports = {
  notificationIdParam,
  pushTokenSchema,
};
