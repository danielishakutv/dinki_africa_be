const router = require('express').Router();
const ctrl = require('./reviews.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { createReviewSchema } = require('./reviews.validation');

router.use(auth);

router.post('/', authorize('customer'), validate(createReviewSchema), ctrl.createReview);
router.get('/me', authorize('customer'), ctrl.getMyReviews);

module.exports = router;
