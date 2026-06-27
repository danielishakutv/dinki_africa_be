const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Optional authentication. If a valid Bearer token is present, attach req.user;
 * otherwise continue as a guest. Never errors on a missing/invalid token — used
 * by public surfaces (e.g. the styles feed) that enrich the response for logged-in
 * viewers (filled likes/saves) but must stay fully browsable while logged out.
 */
module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], config.jwt.secret);
    req.user = { id: decoded.userId, role: decoded.role, email: decoded.email };
  } catch {
    // Ignore — expired/invalid token just means "treat as guest" here.
  }
  return next();
};
