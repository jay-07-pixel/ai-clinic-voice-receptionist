const { AppError } = require('./errorHandler');

/**
 * Placeholder request validation middleware.
 * Accepts a validator function that returns { error, value }.
 *
 * Usage:
 *   router.post('/path', validateRequest(myValidator), controller.handler);
 */
function validateRequest(validator) {
  return (req, _res, next) => {
    if (typeof validator !== 'function') {
      return next(new AppError('Validator function is required', 500, false));
    }

    const { error, value } = validator(req);

    if (error) {
      return next(new AppError(error, 400));
    }

    req.validated = value;
    return next();
  };
}

module.exports = validateRequest;
