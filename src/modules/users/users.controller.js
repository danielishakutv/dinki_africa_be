const usersService = require('./users.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.getProfile = catchAsync(async (req, res) => {
  const user = await usersService.getProfile(req.user.id);
  return success(res, user);
});

exports.updateProfile = catchAsync(async (req, res) => {
  const user = await usersService.updateProfile(req.user.id, req.body);
  return success(res, user);
});

exports.updateAvatar = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No image uploaded' } });
  }
  const avatarUrl = `/uploads/${req.file.filename}`;
  const user = await usersService.updateAvatar(req.user.id, avatarUrl);
  return success(res, user);
});

exports.getStats = catchAsync(async (req, res) => {
  const stats = await usersService.getStats(req.user.id, req.user.role);
  return success(res, stats);
});

exports.updatePreferences = catchAsync(async (req, res) => {
  const prefs = await usersService.updatePreferences(req.user.id, req.body);
  return success(res, prefs);
});

exports.completeOnboarding = catchAsync(async (req, res) => {
  const user = await usersService.completeOnboarding(req.user.id, req.body);
  return success(res, user);
});

exports.deleteAccount = catchAsync(async (req, res) => {
  await usersService.softDelete(req.user.id);
  res.clearCookie('refreshToken');
  return success(res, { message: 'Account deleted' });
});

exports.searchUsers = catchAsync(async (req, res) => {
  const { q, role } = req.query;
  const users = await usersService.searchUsers(q, {
    role: role || 'customer',
    excludeUserId: req.user.id,
    limit: 10,
  });
  return success(res, users);
});

exports.checkUsername = catchAsync(async (req, res) => {
  const result = await usersService.checkUsername(req.query.username);
  return success(res, result);
});

exports.setUsername = catchAsync(async (req, res) => {
  const user = await usersService.setUsername(req.user.id, req.body.username);
  return success(res, user);
});

exports.adminChangeUsername = catchAsync(async (req, res) => {
  const user = await usersService.adminChangeUsername(req.params.id, req.body.username);
  return success(res, user);
});
