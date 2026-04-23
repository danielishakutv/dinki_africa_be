const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const ctrl = require('./admin.controller');
const { broadcastSchema } = require('./admin.validation');

// Every route below REQUIRES a valid JWT AND an admin/superadmin role.
// Order matters: `auth` populates req.user; `authorize` then checks the role.
router.use(auth);
router.use(authorize('admin', 'superadmin'));

// Per-admin throttle on broadcast. 10 sends per 10 minutes is generous for
// real ops and still blunts a footgun (e.g. a typo'd scope firing repeatedly).
const broadcastLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many broadcasts in a short window. Try again in a few minutes.',
      },
    });
  },
});

router.get('/ping', ctrl.ping);
router.get('/stats', ctrl.stats);

router.post(
  '/notifications/broadcast',
  broadcastLimiter,
  validate(broadcastSchema),
  ctrl.broadcastNotification,
);

module.exports = router;
