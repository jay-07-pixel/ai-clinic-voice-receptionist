const { AppError } = require('./errorHandler');

function notFound(req, _res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

module.exports = notFound;
