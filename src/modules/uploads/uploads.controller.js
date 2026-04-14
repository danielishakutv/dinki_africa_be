const { processImage } = require('../../middleware/upload');
const { v4: uuidv4 } = require('uuid');
const catchAsync = require('../../utils/catchAsync');
const { success } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');

exports.uploadSingle = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new AppError('No image uploaded', 400, 'NO_FILE');
  }

  const filename = uuidv4();
  const result = await processImage(req.file.buffer, filename);

  return success(res, result, 201);
});

exports.uploadMultiple = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No images uploaded', 400, 'NO_FILES');
  }

  const results = await Promise.all(
    req.files.map(async (file) => {
      const filename = uuidv4();
      return processImage(file.buffer, filename);
    })
  );

  return success(res, results, 201);
});
