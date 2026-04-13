const service = require('./reviews.service');

exports.createReview = async (req, res, next) => {
  try {
    const review = await service.createReview(req.user.id, req.body);
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await service.getMyReviews(req.user.id, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
