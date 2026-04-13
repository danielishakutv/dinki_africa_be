const { body, param, query } = require('express-validator');

const conversationIdParam = [
  param('id').isUUID().withMessage('Invalid conversation ID'),
];

const startConversationSchema = [
  body('participant_id').isUUID().withMessage('Valid participant ID is required'),
  body('text').optional().trim().isLength({ max: 2000 }).withMessage('Message max 2000 chars'),
];

const sendMessageSchema = [
  ...conversationIdParam,
  body('text').optional().trim().isLength({ max: 2000 }),
  body('image_url').optional().isString().isLength({ max: 500 }),
];

const listMessagesSchema = [
  ...conversationIdParam,
  query('cursor').optional().isISO8601().withMessage('Invalid cursor timestamp'),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];

module.exports = {
  conversationIdParam,
  startConversationSchema,
  sendMessageSchema,
  listMessagesSchema,
};
