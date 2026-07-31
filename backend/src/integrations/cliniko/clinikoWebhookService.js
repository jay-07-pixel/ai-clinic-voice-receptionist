const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/errorHandler');
const ClinikoSyncRepository = require('../../repositories/clinikoSyncRepository');
const { ClinikoMapper, asObject } = require('./clinikoMapper');

/**
 * Optional Cliniko webhook ingest.
 * Re-queues local sync rows when Cliniko notifies remote changes.
 */
class ClinikoWebhookService {
  /**
   * @param {object} [deps]
   */
  constructor({
    repository = new ClinikoSyncRepository(),
    mapper = new ClinikoMapper(),
  } = {}) {
    this.repository = repository;
    this.mapper = mapper;
  }

  verifySignature(rawBody, signatureHeader) {
    const secret = config.cliniko?.webhookSecret;
    if (!secret) {
      // If no secret configured, accept in non-production only.
      if (config.isProduction) {
        return { valid: false, reason: 'CLINIKO_WEBHOOK_SECRET is not configured' };
      }
      return { valid: true, reason: 'skipped' };
    }

    if (typeof signatureHeader !== 'string' || !signatureHeader) {
      return { valid: false, reason: 'Missing Cliniko webhook signature' };
    }

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody || '', 'utf8')
      .digest('hex');

    try {
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(signatureHeader.trim(), 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { valid: false, reason: 'Invalid Cliniko webhook signature' };
      }
    } catch {
      return { valid: false, reason: 'Invalid Cliniko webhook signature' };
    }

    return { valid: true };
  }

  async handleEvent(payload, { rawBody, signature } = {}) {
    const verification = this.verifySignature(rawBody, signature);
    if (!verification.valid) {
      throw new AppError(verification.reason || 'Unauthorized', 401, {
        code: 'UNAUTHORIZED',
      });
    }

    const body = asObject(payload);
    const eventType = body.event || body.type || body.action || 'unknown';
    const clinikoId =
      body.id ||
      body.appointment_id ||
      body.patient_id ||
      body.data?.id ||
      null;

    logger.info('Cliniko webhook accepted', { eventType, clinikoId });

    let requeued = null;

    if (clinikoId) {
      const existing = await this.repository.findByClinikoId(String(clinikoId));

      if (existing) {
        const result = await this.repository.enqueue({
          entityType: existing.entityType,
          localId: existing.localId,
          direction: 'INBOUND',
          force: true,
          metadata: {
            source: 'cliniko_webhook',
            eventType,
            clinikoId: String(clinikoId),
          },
        });
        requeued = this.mapper.toSyncListItem(result.record);
      }
    }

    return {
      accepted: true,
      eventType,
      clinikoId: clinikoId ? String(clinikoId) : null,
      clinikoSync: requeued,
    };
  }
}

module.exports = ClinikoWebhookService;
