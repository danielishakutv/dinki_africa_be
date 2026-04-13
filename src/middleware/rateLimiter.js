const rateLimit = require('express-rate-limit');

function createLimiter(maxAttempts, windowMinutes) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.ip + ':' + (req.body?.email || '');
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many attempts. Try again in ${windowMinutes} minutes.`,
        },
      });
    },
  });
}

module.exports = { createLimiter };
