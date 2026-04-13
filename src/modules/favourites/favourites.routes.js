const router = require('express').Router();
const ctrl = require('./favourites.controller');
const auth = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { toggleFavouriteSchema, listFavouritesSchema } = require('./favourites.validation');

router.use(auth);

router.post('/toggle', validate(toggleFavouriteSchema), ctrl.toggleFavourite);
router.get('/', validate(listFavouritesSchema), ctrl.listFavourites);
router.post('/check', ctrl.checkFavourites);

module.exports = router;
