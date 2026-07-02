const authService = require('./auth.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.signup = catchAsync(async (req, res) => {
  const result = await authService.signup(req.body);
  // Inactive placeholder → frontend switches to the activate flow (no session yet).
  if (result.inactive_account) {
    return success(res, result, 200);
  }
  // Auto-login: set the refresh cookie and return the access token + user.
  setRefreshCookie(res, result.refreshToken);
  return success(res, { accessToken: result.accessToken, user: result.user }, 201);
});

exports.verifyEmail = catchAsync(async (req, res) => {
  const io = req.app.get('io');
  // Token-based (link). The user is already logged in, so no new session — just
  // return the refreshed user so the SPA can update state.
  const result = await authService.verifyEmail(req.body, io);
  return success(res, result);
});

exports.resendVerification = catchAsync(async (req, res) => {
  const result = await authService.resendVerification(req.user.id);
  return success(res, result);
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
  // Path MUST match the one used when setting the cookie, or the browser keeps
  // the stale refresh token and a "logged out" device can silently re-auth.
  res.clearCookie('refreshToken', { path: '/v1/auth' });
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
  res.clearCookie('refreshToken', { path: '/v1/auth' });
  return success(res, result);
});

exports.activate = catchAsync(async (req, res) => {
  const result = await authService.activate(req.body);
  // Auto-login the newly activated account.
  setRefreshCookie(res, result.refreshToken);
  return success(res, { accessToken: result.accessToken, user: result.user });
});

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/v1/auth',
  });
}
