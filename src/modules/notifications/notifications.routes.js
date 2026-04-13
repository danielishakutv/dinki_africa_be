const router = require('express').Router();
const ctrl = require('./notifications.controller');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { notificationIdParam, pushTokenSchema } = require('./notifications.validation');

router.use(auth);

router.get('/', ctrl.listNotifications);
router.get('/unread-count', ctrl.getUnreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.get('/:id', validate(notificationIdParam), ctrl.getNotification);
router.patch('/:id/read', validate(notificationIdParam), ctrl.markRead);
router.post('/push-token', validate(pushTokenSchema), ctrl.registerPushToken);

module.exports = router;
