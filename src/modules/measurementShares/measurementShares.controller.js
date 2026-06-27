const service = require('./measurementShares.service');

exports.createShare = async (req, res, next) => {
  try {
    const share = await service.createShare(req.user.id, req.body);
    res.status(201).json({ success: true, data: share });
  } catch (err) { next(err); }
};

exports.listShares = async (req, res, next) => {
  try {
    const shares = await service.listShares(req.user.id);
    res.json({ success: true, data: shares });
  } catch (err) { next(err); }
};

exports.getShare = async (req, res, next) => {
  try {
    const share = await service.getShare(req.user.id, req.params.id);
    res.json({ success: true, data: share });
  } catch (err) { next(err); }
};

exports.updateShare = async (req, res, next) => {
  try {
    const share = await service.updateShare(req.user.id, req.params.id, req.body);
    res.json({ success: true, data: share });
  } catch (err) { next(err); }
};

exports.deleteShare = async (req, res, next) => {
  try {
    const result = await service.deleteShare(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.getAnalytics = async (req, res, next) => {
  try {
    const data = await service.getAnalytics(req.user.id, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

// Public — no auth required (optionalAuth lets the owner preview without
// inflating their own view count).
exports.viewByToken = async (req, res, next) => {
  try {
    const data = await service.viewByToken(req.params.token, {
      viewerId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'] || req.headers['referrer'],
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
