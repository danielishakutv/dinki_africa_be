const router = require('express').Router();
const ctrl = require('./measurementShares.controller');
const auth = require('../../middleware/auth');
const optionalAuth = require('../../middleware/optionalAuth');
const { validate } = require('../../middleware/validate');
const { idParam, tokenParam, createSchema, updateSchema } = require('./measurementShares.validation');

// Public share page (no auth). optionalAuth so the owner previewing their own
// link is recognised and not counted as a view.
router.get('/public/:token', optionalAuth, validate(tokenParam), ctrl.viewByToken);

// Everything below requires the owner to be authenticated.
router.use(auth);
router.post('/', validate(createSchema), ctrl.createShare);
router.get('/', ctrl.listShares);
router.get('/:id', validate(idParam), ctrl.getShare);
router.patch('/:id', validate(updateSchema), ctrl.updateShare);
router.delete('/:id', validate(idParam), ctrl.deleteShare);
router.get('/:id/analytics', validate(idParam), ctrl.getAnalytics);

module.exports = router;
