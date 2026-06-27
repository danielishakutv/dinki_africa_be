const service = require('./styles.service');

exports.listStyles = async (req, res, next) => {
  try {
    const { category, tag, q, source_type, sort, page, limit } = req.query;
    const result = await service.listStyles(
      { category, tag, q, source_type, sort, page, limit },
      req.user?.id
    );
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.listCategories = async (req, res, next) => {
  try {
    const data = await service.listCategories();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getStyle = async (req, res, next) => {
  try {
    const style = await service.getStyle(req.params.id, req.user?.id);
    res.json({ success: true, data: style });
  } catch (err) { next(err); }
};

exports.toggleLike = async (req, res, next) => {
  try {
    const result = await service.toggleLike(req.params.id, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.listComments = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await service.listComments(req.params.id, { page, limit });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.addComment = async (req, res, next) => {
  try {
    const comment = await service.addComment(req.params.id, req.user.id, req.body.body);
    res.status(201).json({ success: true, data: comment });
  } catch (err) { next(err); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const result = await service.deleteComment(req.params.commentId, req.user.id, req.user.role);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.createStyle = async (req, res, next) => {
  try {
    const created = await service.createStyle(req.user, req.body);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
};

exports.deleteStyle = async (req, res, next) => {
  try {
    const result = await service.deleteStyle(req.params.id, req.user);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};
