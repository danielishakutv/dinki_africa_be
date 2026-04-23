/**
 * Admin module — top-level controllers.
 *
 * Every admin endpoint is gated by the `authorize('admin', 'superadmin')`
 * middleware mounted in admin.routes.js. Controllers here MUST NOT re-check
 * roles — trust the router-level guard, keep handlers focused on behaviour.
 */

const service = require('./admin.service');

exports.ping = (req, res) => {
  res.json({
    success: true,
    data: {
      ok: true,
      role: req.user.role,
      userId: req.user.id,
      serverTime: new Date().toISOString(),
    },
  });
};

exports.stats = async (req, res, next) => {
  try {
    const data = await service.getPlatformStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.broadcastNotification = async (req, res, next) => {
  try {
    const { target, title, message, link } = req.body;
    const result = await service.broadcastNotification({
      actorId: req.user.id,
      target,
      title,
      message,
      link,
      ip: req.ip,
      io: req.app.get('io'),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
