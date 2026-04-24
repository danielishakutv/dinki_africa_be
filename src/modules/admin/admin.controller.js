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

/* ---------------- User management ---------------- */

exports.listUsers = async (req, res, next) => {
  try {
    const { q, role, status, page, limit } = req.query;
    const result = await service.listUsers({ q, role, status, page, limit });
    res.json({ success: true, data: result.users, meta: result.pagination });
  } catch (err) {
    next(err);
  }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await service.getUserDetail(req.params.id);
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await service.updateUser({
      actor: req.user,
      targetId: req.params.id,
      updates: req.body,
      ip: req.ip,
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.resetUserPassword = async (req, res, next) => {
  try {
    const result = await service.resetUserPassword({
      actor: req.user,
      targetId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.setUserPassword = async (req, res, next) => {
  try {
    const result = await service.setUserPassword({
      actor: req.user,
      targetId: req.params.id,
      newPassword: req.body.newPassword,
      ip: req.ip,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.forceLogoutUser = async (req, res, next) => {
  try {
    const result = await service.forceLogoutUser({
      actor: req.user,
      targetId: req.params.id,
      ip: req.ip,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
