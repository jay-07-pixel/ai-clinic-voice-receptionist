const logger = require('../utils/logger');
const config = require('../config');

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  logger.error('Request error', {
    statusCode,
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: config.isProduction ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
}

module.exports = {
  AppError,
  errorHandler,
};
