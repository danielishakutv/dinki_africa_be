function success(res, data, statusCode = 200, meta) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
}

function error(res, message, statusCode = 500, code = 'ERROR', details) {
  const response = {
    success: false,
    error: { code, message },
  };
  if (details) response.error.details = details;
  return res.status(statusCode).json(response);
}

module.exports = { success, error };
