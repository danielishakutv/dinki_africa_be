const service = require('./orders.service');

exports.createOrder = async (req, res, next) => {
  try {
    const order = await service.createOrder(req.user.userId, req.body);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

exports.listCustomerOrders = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await service.listCustomerOrders(req.user.userId, { status, page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.listTailorOrders = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await service.listTailorOrders(req.user.userId, { status, page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getOrder = async (req, res, next) => {
  try {
    const order = await service.getOrder(req.user.userId, req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
};

exports.acceptOrder = async (req, res, next) => {
  try {
    const result = await service.acceptOrder(req.user.userId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.declineOrder = async (req, res, next) => {
  try {
    const result = await service.declineOrder(req.user.userId, req.params.id, req.body.reason);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const result = await service.cancelOrder(req.user.userId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.addReferenceImages = async (req, res, next) => {
  try {
    const result = await service.addReferenceImages(req.user.userId, req.params.id, req.body.images);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
