const router = require('express').Router();
const ctrl = require('./customers.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  createCustomerSchema,
  updateCustomerSchema,
  updateMeasurementsSchema,
  addCustomFieldSchema,
  listCustomersSchema,
} = require('./customers.validation');

router.use(auth);
router.use(authorize('tailor'));

router.get('/', validate(listCustomersSchema), ctrl.listCustomers);
router.post('/', validate(createCustomerSchema), ctrl.createCustomer);
router.get('/:id', ctrl.getCustomer);
router.patch('/:id', validate(updateCustomerSchema), ctrl.updateCustomer);
router.delete('/:id', ctrl.deleteCustomer);
router.patch('/:id/measurements', validate(updateMeasurementsSchema), ctrl.updateMeasurements);
router.post('/:id/custom-fields', validate(addCustomFieldSchema), ctrl.addCustomField);
router.delete('/:id/custom-fields/:key', ctrl.removeCustomField);

module.exports = router;
