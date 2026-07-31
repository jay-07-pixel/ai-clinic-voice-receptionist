const crypto = require('crypto');
const config = require('../../config');
const { SIGNATURE_TOLERANCE_MS } = require('../../dto/retellDto');

/**
 * Verify Retell X-Retell-Signature: v={unix_ms},d={hmac_hex}
 * HMAC-SHA256(apiKey, rawBody + timestamp)
 *
 * @param {string} rawBody
 * @param {string|undefined} signatureHeader
 * @param {object} [options]
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyRetellSignature(rawBody, signatureHeader, options = {}) {
  const apiKey = options.apiKey ?? config.retell?.apiKey;
  const skipVerify = options.skipVerify ?? config.retell?.skipSignatureVerify;

  if (skipVerify) {
    return { valid: true, reason: 'skipped' };
  }

  if (!apiKey) {
    return { valid: false, reason: 'RETELL_API_KEY is not configured' };
  }

  if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
    return { valid: false, reason: 'Missing X-Retell-Signature header' };
  }

  if (typeof rawBody !== 'string') {
    return { valid: false, reason: 'Raw body must be a string' };
  }

  const match = signatureHeader.trim().match(/^v=(\d+),d=(.+)$/);
  if (!match) {
    return { valid: false, reason: 'Malformed X-Retell-Signature header' };
  }

  const timestamp = match[1];
  const digest = match[2];
  const timestampMs = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(timestampMs)) {
    return { valid: false, reason: 'Invalid signature timestamp' };
  }

  const skew = Math.abs(Date.now() - timestampMs);
  if (skew > SIGNATURE_TOLERANCE_MS) {
    return { valid: false, reason: 'Signature timestamp outside tolerance window' };
  }

  const expectedHex = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody + timestamp, 'utf8')
    .digest('hex');

  try {
    const expected = Buffer.from(expectedHex, 'utf8');
    const actual = Buffer.from(digest, 'utf8');
    if (expected.length !== actual.length) {
      return { valid: false, reason: 'Invalid signature digest' };
    }
    if (!crypto.timingSafeEqual(expected, actual)) {
      return { valid: false, reason: 'Invalid signature digest' };
    }
  } catch {
    return { valid: false, reason: 'Invalid signature digest' };
  }

  return { valid: true };
}

module.exports = {
  verifyRetellSignature,
};
