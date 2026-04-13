const router = require('express').Router();
const ctrl = require('./jobs.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  createJobSchema,
  updateJobSchema,
  updateStatusSchema,
  toggleInvoiceSchema,
  listJobsSchema,
} = require('./jobs.validation');

router.use(auth);
router.use(authorize('tailor'));

// Stats must come before /:id to avoid matching "stats" as a UUID
router.get('/stats', ctrl.getStats);

router.get('/', validate(listJobsSchema), ctrl.listJobs);
router.post('/', validate(createJobSchema), ctrl.createJob);
router.get('/:id', ctrl.getJob);
router.patch('/:id', validate(updateJobSchema), ctrl.updateJob);
router.patch('/:id/status', validate(updateStatusSchema), ctrl.updateStatus);
router.patch('/:id/invoice', validate(toggleInvoiceSchema), ctrl.toggleInvoice);
router.delete('/:id', ctrl.deleteJob);

module.exports = router;
