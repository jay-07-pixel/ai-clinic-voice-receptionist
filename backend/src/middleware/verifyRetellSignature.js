const { AppError } = require('../middleware/errorHandler');
const { verifyRetellSignature } = require('../integrations/retell/verifySignature');

/**
 * Verifies Retell webhook signatures using the captured raw body.
 */
function verifyRetellWebhook(req, _res, next) {
  const rawBody =
    typeof req.rawBody === 'string'
      ? req.rawBody
      : Buffer.isBuffer(req.rawBody)
        ? req.rawBody.toString('utf8')
        : null;

  if (!rawBody) {
    return next(
      new AppError('Raw request body unavailable for signature verification', 400, {
        code: 'VALIDATION_ERROR',
      }),
    );
  }

  const signature =
    req.headers['x-retell-signature'] || req.headers['X-Retell-Signature'];

  const result = verifyRetellSignature(rawBody, signature);
  if (!result.valid) {
    return next(
      new AppError(result.reason || 'Invalid Retell webhook signature', 401, {
        code: 'UNAUTHORIZED',
      }),
    );
  }

  return next();
}

module.exports = verifyRetellWebhook;
