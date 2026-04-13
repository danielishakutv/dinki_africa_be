const service = require('./favourites.service');

exports.toggleFavourite = async (req, res, next) => {
  try {
    const result = await service.toggleFavourite(req.user.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.listFavourites = async (req, res, next) => {
  try {
    const { type, page, limit } = req.query;
    const result = await service.listFavourites(req.user.id, { type, page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.checkFavourites = async (req, res, next) => {
  try {
    const result = await service.checkFavourites(req.user.id, req.body.items);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
