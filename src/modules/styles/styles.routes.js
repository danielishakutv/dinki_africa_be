const router = require('express').Router();
const ctrl = require('./styles.controller');
const auth = require('../../middleware/auth');
const optionalAuth = require('../../middleware/optionalAuth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  idParam,
  commentIdParam,
  listSchema,
  listCommentsSchema,
  addCommentSchema,
  createStyleSchema,
} = require('./styles.validation');

// Public discovery (optionalAuth enriches with the viewer's like/save state).
router.get('/', optionalAuth, validate(listSchema), ctrl.listStyles);
router.get('/categories', ctrl.listCategories);
router.get('/:id', optionalAuth, validate(idParam), ctrl.getStyle);
router.get('/:id/comments', validate(listCommentsSchema), ctrl.listComments);

// Authenticated interactions.
router.post('/:id/like', auth, validate(idParam), ctrl.toggleLike);
router.post('/:id/comments', auth, validate(addCommentSchema), ctrl.addComment);
router.delete('/comments/:commentId', auth, validate(commentIdParam), ctrl.deleteComment);

// Publishing — tailors publish their own work; admins curate from any source.
router.post('/', auth, authorize('tailor', 'admin', 'superadmin'), validate(createStyleSchema), ctrl.createStyle);
router.delete('/:id', auth, authorize('tailor', 'admin', 'superadmin'), validate(idParam), ctrl.deleteStyle);

module.exports = router;
