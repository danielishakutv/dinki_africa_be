const AppError = require('../utils/AppError');

module.exports = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401, 'AUTH_REQUIRED'));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Not authorized', 403, 'FORBIDDEN'));
    }
    next();
  };
};
