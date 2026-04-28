const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const ctrl = require('./admin.controller');
const {
  broadcastSchema,
  listUsersSchema,
  userIdParam,
  updateUserSchema,
  setPasswordSchema,
  hardDeleteSchema,
} = require('./admin.validation');

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

// ---- Analytics (read-only, gated by admin auth above) ----
router.get('/analytics/overview',    ctrl.analyticsOverview);
router.get('/analytics/timeseries',  ctrl.analyticsTimeseries);
router.get('/analytics/cohorts',     ctrl.analyticsCohorts);
router.get('/analytics/funnels',     ctrl.analyticsFunnels);
router.get('/analytics/marketplace', ctrl.analyticsMarketplace);
router.get('/analytics/referrals',   ctrl.analyticsReferrals);

router.post(
  '/notifications/broadcast',
  broadcastLimiter,
  validate(broadcastSchema),
  ctrl.broadcastNotification,
);

// ---- User management ----
// Per-admin rate limit on destructive user ops. List + get are unthrottled.
const sensitiveUserOpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many sensitive user operations. Try again shortly.' },
    });
  },
});

router.get('/users', validate(listUsersSchema), ctrl.listUsers);
router.get('/users/:id', validate(userIdParam), ctrl.getUser);
router.patch('/users/:id', sensitiveUserOpLimiter, validate(updateUserSchema), ctrl.updateUser);
router.post('/users/:id/reset-password', sensitiveUserOpLimiter, validate(userIdParam), ctrl.resetUserPassword);
router.post('/users/:id/set-password', sensitiveUserOpLimiter, validate(setPasswordSchema), ctrl.setUserPassword);
router.post('/users/:id/force-logout', sensitiveUserOpLimiter, validate(userIdParam), ctrl.forceLogoutUser);
router.post('/users/:id/anonymize',    sensitiveUserOpLimiter, validate(userIdParam),     ctrl.anonymizeUser);
router.post('/users/:id/hard-delete',  sensitiveUserOpLimiter, validate(hardDeleteSchema), ctrl.hardDeleteUser);

module.exports = router;
