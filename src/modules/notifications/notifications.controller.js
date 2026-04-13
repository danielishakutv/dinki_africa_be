const service = require('./notifications.service');

exports.listNotifications = async (req, res, next) => {
  try {
    const grouped = await service.listNotifications(req.user.id);
    res.json({ success: true, data: grouped });
  } catch (err) {
    next(err);
  }
};

exports.getNotification = async (req, res, next) => {
  try {
    const notification = await service.getNotification(req.user.id, req.params.id);
    res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const result = await service.markRead(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const result = await service.markAllRead(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const result = await service.getUnreadCount(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.registerPushToken = async (req, res, next) => {
  try {
    const result = await service.registerPushToken(req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
