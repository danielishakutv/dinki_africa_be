const customersService = require('./customers.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.listCustomers = catchAsync(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await customersService.listCustomers(req.user.id, { search, page, limit });
  return success(res, result.customers, 200, result.pagination);
});

exports.getCustomer = catchAsync(async (req, res) => {
  const customer = await customersService.getCustomer(req.user.id, req.params.id);
  return success(res, customer);
});

exports.createCustomer = catchAsync(async (req, res) => {
  const customer = await customersService.createCustomer(req.user.id, req.body);
  return success(res, customer, 201);
});

exports.updateCustomer = catchAsync(async (req, res) => {
  const customer = await customersService.updateCustomer(req.user.id, req.params.id, req.body);
  return success(res, customer);
});

exports.deleteCustomer = catchAsync(async (req, res) => {
  await customersService.deleteCustomer(req.user.id, req.params.id);
  return success(res, { message: 'Customer deleted' });
});

exports.updateMeasurements = catchAsync(async (req, res) => {
  const result = await customersService.updateMeasurements(req.user.id, req.params.id, req.body);
  return success(res, result);
});

exports.addCustomField = catchAsync(async (req, res) => {
  const result = await customersService.addCustomField(req.user.id, req.params.id, req.body);
  return success(res, result, 201);
});

exports.removeCustomField = catchAsync(async (req, res) => {
  const result = await customersService.removeCustomField(req.user.id, req.params.id, req.params.key);
  return success(res, result);
});
