const service = require('./storefronts.service');

exports.getStorefront = async (req, res, next) => {
  try {
    const storefront = await service.getStorefront(req.params.slug);
    res.json({ success: true, data: storefront });
  } catch (err) {
    next(err);
  }
};

exports.getPortfolio = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await service.getPortfolio(req.params.slug, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getReviews = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await service.getReviews(req.params.slug, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.updateStorefront = async (req, res, next) => {
  try {
    const updated = await service.updateStorefront(req.user.userId, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

exports.addPortfolioItem = async (req, res, next) => {
  try {
    const item = await service.addPortfolioItem(req.user.userId, req.body);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

exports.removePortfolioItem = async (req, res, next) => {
  try {
    await service.removePortfolioItem(req.user.userId, req.params.id);
    res.json({ success: true, data: { message: 'Portfolio item removed' } });
  } catch (err) {
    next(err);
  }
};
