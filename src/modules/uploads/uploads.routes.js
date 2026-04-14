const router = require('express').Router();
const ctrl = require('./uploads.controller');
const auth = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');

router.use(auth);

router.post('/image', upload.single('image'), ctrl.uploadSingle);
router.post('/images', upload.array('images', 4), ctrl.uploadMultiple);

module.exports = router;
