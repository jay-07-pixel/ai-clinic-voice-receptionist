const logger = require('../utils/logger');
const config = require('../config');

class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {boolean|object} [isOperationalOrOptions=true]
   */
  constructor(message, statusCode = 500, isOperationalOrOptions = true) {
    super(message);
    this.statusCode = statusCode;

    if (typeof isOperationalOrOptions === 'object' && isOperationalOrOptions !== null) {
      this.isOperational = isOperationalOrOptions.isOperational !== false;
      this.code = isOperationalOrOptions.code;
      this.details = isOperationalOrOptions.details;
    } else {
      this.isOperational = Boolean(isOperationalOrOptions);
    }

    Error.captureStackTrace(this, this.constructor);
  }
}

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR');

  logger.error('Request error', {
    statusCode,
    code,
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: config.isProduction ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
      ...(req.id ? { requestId: req.id } : {}),
      ...(config.isProduction ? {} : { stack: err.stack }),
    },
  });
}

module.exports = {
  AppError,
  errorHandler,
};
