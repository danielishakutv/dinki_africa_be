const router = require('express').Router();
const ctrl = require('./orders.controller');
const auth = require('../../middleware/auth');
const authorize = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const {
  orderIdParam,
  createOrderSchema,
  listOrdersSchema,
  declineOrderSchema,
} = require('./orders.validation');

router.use(auth);

// Customer routes
router.post('/', authorize('customer'), validate(createOrderSchema), ctrl.createOrder);
router.get('/', authorize('customer'), validate(listOrdersSchema), ctrl.listCustomerOrders);
router.patch('/:id/cancel', authorize('customer'), validate(orderIdParam), ctrl.cancelOrder);
router.post('/:id/images', authorize('customer'), validate(orderIdParam), ctrl.addReferenceImages);

// Tailor routes
router.get('/incoming', authorize('tailor'), validate(listOrdersSchema), ctrl.listTailorOrders);
router.patch('/:id/accept', authorize('tailor'), validate(orderIdParam), ctrl.acceptOrder);
router.patch('/:id/decline', authorize('tailor'), validate(declineOrderSchema), ctrl.declineOrder);

// Both roles
router.get('/:id', validate(orderIdParam), ctrl.getOrder);

module.exports = router;
