const router = require('express').Router();
const ctrl = require('./messaging.controller');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const {
  conversationIdParam,
  startConversationSchema,
  sendMessageSchema,
  listMessagesSchema,
} = require('./messaging.validation');

router.use(auth);

router.get('/', ctrl.listConversations);
router.post('/', validate(startConversationSchema), ctrl.startConversation);
router.get('/:id/messages', validate(listMessagesSchema), ctrl.getMessages);
router.post('/:id/messages', validate(sendMessageSchema), ctrl.sendMessage);
router.patch('/:id/read', validate(conversationIdParam), ctrl.markAsRead);
router.patch('/:id/pin', validate(conversationIdParam), ctrl.togglePin);

module.exports = router;
