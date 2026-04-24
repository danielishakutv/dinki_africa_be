const router = require('express').Router();
const { param } = require('express-validator');
const rateLimit = require('express-rate-limit');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const ctrl = require('./referrals.controller');

// The by-code lookup is PUBLIC (invite landing page renders before signup).
// Rate-limit it per IP to blunt code enumeration — combined with the 4-20
// char alphanumeric space, making brute force infeasible.
const publicLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many invite lookups. Try again shortly.' },
    });
  },
});

// Public — only returns minimal display info (name, role, avatar).
router.get(
  '/by-code/:code',
  publicLookupLimiter,
  validate([param('code').trim().matches(/^[A-Za-z0-9_-]{4,20}$/).withMessage('Invalid code')]),
  ctrl.getByCode,
);

// Authenticated — the current user's own referral snapshot.
router.get('/me', auth, ctrl.getMyStats);

module.exports = router;
