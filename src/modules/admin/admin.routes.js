const router = require('express').Router();
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const ctrl = require('./admin.controller');

// Every route below REQUIRES a valid JWT AND an admin/superadmin role.
// Order matters: `auth` populates req.user; `authorize` then checks the role.
router.use(auth);
router.use(authorize('admin', 'superadmin'));

router.get('/ping', ctrl.ping);
router.get('/stats', ctrl.stats);

module.exports = router;
