const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const ctrl = require('./support.controller');
const { createTicketSchema } = require('./support.validation');

// 5 tickets per hour per account — stops an abusive loop without blocking
// a user who's legitimately filing multiple issues in one sitting.
const ticketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many support tickets in a short window. Try again in an hour.',
      },
    });
  },
});

router.use(auth);
router.post('/ticket', ticketLimiter, validate(createTicketSchema), ctrl.createTicket);

module.exports = router;
