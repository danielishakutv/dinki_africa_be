const router = require('express').Router();
const ctrl = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { createLimiter } = require('../../middleware/rateLimiter');
const auth = require('../../middleware/auth');
const {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  activateSchema,
} = require('./auth.validation');

const authLimiter = createLimiter(5, 15);       // 5 attempts per 15 min
const forgotLimiter = createLimiter(3, 60);      // 3 per hour

router.post('/signup', authLimiter, validate(signupSchema), ctrl.signup);
router.post('/activate', authLimiter, validate(activateSchema), ctrl.activate);
router.post('/verify-email', authLimiter, validate(verifyEmailSchema), ctrl.verifyEmail);
router.post('/login', authLimiter, validate(loginSchema), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', auth, ctrl.logout);
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), ctrl.resetPassword);
router.post('/change-password', auth, validate(changePasswordSchema), ctrl.changePassword);

module.exports = router;
