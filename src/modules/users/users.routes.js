const router = require('express').Router();
const ctrl = require('./users.controller');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { updateProfileSchema, onboardingSchema, preferencesSchema, searchUsersSchema, usernameSchema, checkUsernameSchema, adminUsernameSchema } = require('./users.validation');
const { upload, processUpload } = require('../../middleware/upload');
const authorize = require('../../middleware/authorize');

router.use(auth);

router.get('/search', validate(searchUsersSchema), ctrl.searchUsers);
router.get('/check-username', validate(checkUsernameSchema), ctrl.checkUsername);
router.get('/me', ctrl.getProfile);
router.patch('/me', validate(updateProfileSchema), ctrl.updateProfile);
router.patch('/me/avatar', upload.single('avatar'), processUpload, ctrl.updateAvatar);
router.get('/me/stats', ctrl.getStats);
router.patch('/me/preferences', validate(preferencesSchema), ctrl.updatePreferences);
router.post('/me/onboarding', validate(onboardingSchema), ctrl.completeOnboarding);
router.put('/me/username', validate(usernameSchema), ctrl.setUsername);
router.delete('/me', ctrl.deleteAccount);

// Admin-only
router.patch('/:id/username', authorize('admin'), validate(adminUsernameSchema), ctrl.adminChangeUsername);

module.exports = router;
