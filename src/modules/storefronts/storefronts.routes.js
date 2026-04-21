const router = require('express').Router();
const ctrl = require('./storefronts.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  slugParam,
  portfolioParam,
  listReviewsSchema,
  updateStorefrontSchema,
  addPortfolioSchema,
} = require('./storefronts.validation');

// Public routes (no auth required)
router.get('/:slug', validate(slugParam), ctrl.getStorefront);
router.get('/:slug/portfolio', validate(slugParam), ctrl.getPortfolio);
router.get('/:slug/reviews', validate(listReviewsSchema), ctrl.getReviews);
router.get('/:slug/share-meta', validate(slugParam), ctrl.getShareMeta);

// Tailor-only routes
router.patch('/me', auth, authorize('tailor'), validate(updateStorefrontSchema), ctrl.updateStorefront);
router.post('/me/portfolio', auth, authorize('tailor'), validate(addPortfolioSchema), ctrl.addPortfolioItem);
router.delete('/me/portfolio/:id', auth, authorize('tailor'), validate(portfolioParam), ctrl.removePortfolioItem);

module.exports = router;
