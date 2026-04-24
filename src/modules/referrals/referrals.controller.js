const service = require('./referrals.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.getMyStats = catchAsync(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const data = await service.getMyStats(req.user.id, { limit, offset });
  return success(res, data);
});

exports.getByCode = catchAsync(async (req, res) => {
  const data = await service.getByCode(req.params.code);
  return success(res, data);
});
