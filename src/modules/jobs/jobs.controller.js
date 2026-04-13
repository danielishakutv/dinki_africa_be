const jobsService = require('./jobs.service');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');

exports.listJobs = catchAsync(async (req, res) => {
  const { status, overdue, search, page, limit } = req.query;
  const result = await jobsService.listJobs(req.user.id, { status, overdue, search, page, limit });
  return success(res, result.jobs, 200, result.pagination);
});

exports.getJob = catchAsync(async (req, res) => {
  const job = await jobsService.getJob(req.user.id, req.params.id);
  return success(res, job);
});

exports.createJob = catchAsync(async (req, res) => {
  const job = await jobsService.createJob(req.user.id, req.body);
  return success(res, job, 201);
});

exports.updateJob = catchAsync(async (req, res) => {
  const job = await jobsService.updateJob(req.user.id, req.params.id, req.body);
  return success(res, job);
});

exports.updateStatus = catchAsync(async (req, res) => {
  const job = await jobsService.updateStatus(req.user.id, req.params.id, req.body.status);
  return success(res, job);
});

exports.toggleInvoice = catchAsync(async (req, res) => {
  const job = await jobsService.toggleInvoice(req.user.id, req.params.id, req.body.invoiced);
  return success(res, job);
});

exports.deleteJob = catchAsync(async (req, res) => {
  await jobsService.deleteJob(req.user.id, req.params.id);
  return success(res, { message: 'Job deleted' });
});

exports.getStats = catchAsync(async (req, res) => {
  const stats = await jobsService.getStats(req.user.id);
  return success(res, stats);
});
