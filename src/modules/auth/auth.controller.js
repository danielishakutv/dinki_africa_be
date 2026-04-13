const authService = require('./auth.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.signup = catchAsync(async (req, res) => {
  const result = await authService.signup(req.body);
  return success(res, result, 201);
});

exports.verifyEmail = catchAsync(async (req, res) => {
  const result = await authService.verifyEmail(req.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, {
    accessToken: result.accessToken,
    user: result.user,
  });
});

exports.login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body);
  setRefreshCookie(res, result.refreshToken);
  return success(res, {
    accessToken: result.accessToken,
    user: result.user,
  });
});

exports.refresh = catchAsync(async (req, res) => {
  const rawToken = req.cookies.refreshToken;
  const result = await authService.refresh(rawToken);
  setRefreshCookie(res, result.refreshToken);
  return success(res, { accessToken: result.accessToken });
});

exports.logout = catchAsync(async (req, res) => {
  const rawToken = req.cookies.refreshToken;
  await authService.logout(rawToken);
  res.clearCookie('refreshToken');
  return success(res, { message: 'Logged out' });
});

exports.forgotPassword = catchAsync(async (req, res) => {
  const result = await authService.forgotPassword(req.body.email);
  return success(res, result);
});

exports.resetPassword = catchAsync(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return success(res, result);
});

exports.changePassword = catchAsync(async (req, res) => {
  const result = await authService.changePassword(req.user.id, req.body);
  res.clearCookie('refreshToken');
  return success(res, result);
});

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/v1/auth',
  });
}
