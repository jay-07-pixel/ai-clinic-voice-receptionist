const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const CallbackRepository = require('../repositories/callbackRepository');
const { IDEMPOTENCY_TTL_HOURS } = require('../dto/callbackDto');
const {
  toCallbackDetail,
  toCallbackSummary,
  toCreateResponse,
} = require('../mappers/callbackMapper');

class CallbackService {
  /**
   * @param {CallbackRepository} [callbackRepository]
   */
  constructor(callbackRepository = new CallbackRepository()) {
    this.callbackRepository = callbackRepository;
  }

  async createCallback(dto) {
    const requestHash = this.#hashPayload({
      action: 'create',
      phone: dto.phoneE164 || dto.phone,
      patientId: dto.patientId || null,
      branchId: dto.branchId || null,
      callSessionId: dto.callSessionId || null,
      reason: dto.reason,
      source: dto.source,
      priority: dto.priority,
      preferredTime: dto.preferredTime ? dto.preferredTime.toISOString() : null,
    });

    const result = await this.callbackRepository.createAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return this.#mapCreateResult(result, requestHash);
  }

  async listCallbacks(filters) {
    const { callbacks, total } = await this.callbackRepository.findMany(filters);
    const items = callbacks.map(toCallbackSummary).filter(Boolean);

    return {
      callbacks: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        count: items.length,
        hasMore: filters.offset + items.length < total,
      },
    };
  }

  async getCallback(callbackId) {
    const callback = await this.callbackRepository.findById(callbackId);

    if (!callback) {
      throw new AppError('Callback not found', 404, { code: 'NOT_FOUND' });
    }

    return toCallbackDetail(callback);
  }

  async completeCallback(dto) {
    const requestHash = this.#hashPayload({
      action: 'complete',
      callbackId: dto.callbackId,
      callSessionId: dto.callSessionId || null,
      notes: dto.notes || null,
    });

    const result = await this.callbackRepository.completeAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return this.#mapCompleteResult(result, requestHash);
  }

  async failCallback(dto) {
    const requestHash = this.#hashPayload({
      action: 'fail',
      callbackId: dto.callbackId,
      notes: dto.notes || null,
      nextAttemptAt: dto.nextAttemptAt ? dto.nextAttemptAt.toISOString() : null,
    });

    const result = await this.callbackRepository.failAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return this.#mapFailResult(result, requestHash);
  }

  async #mapCreateResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return this.#replayCreate(result.record, requestHash);
    }

    if (result.kind === 'patient_not_found') {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'branch_not_found') {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'call_session_not_found') {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind !== 'created' || !result.callback) {
      throw new AppError('Unable to create callback', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callback: toCreateResponse(result.callback),
      replayed: false,
    };
  }

  async #mapCompleteResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return this.#replayDetail(result.record, requestHash, 'callback_complete');
    }

    if (result.kind === 'not_found') {
      throw new AppError('Callback not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'call_session_not_found') {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'invalid_status') {
      throw new AppError(
        `Callback cannot be completed from status ${result.callback?.status}`,
        409,
        { code: 'INVALID_STATE' },
      );
    }

    if (
      (result.kind !== 'completed' && result.kind !== 'already_completed') ||
      !result.callback
    ) {
      throw new AppError('Unable to complete callback', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callback: toCallbackDetail(result.callback),
      replayed: result.kind === 'already_completed',
    };
  }

  async #mapFailResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return this.#replayDetail(result.record, requestHash, 'callback_fail');
    }

    if (result.kind === 'not_found') {
      throw new AppError('Callback not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'invalid_status') {
      throw new AppError(
        `Callback cannot be failed from status ${result.callback?.status}`,
        409,
        { code: 'INVALID_STATE' },
      );
    }

    if (
      !['retry_scheduled', 'failed', 'already_failed'].includes(result.kind) ||
      !result.callback
    ) {
      throw new AppError('Unable to fail callback', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callback: toCallbackDetail(result.callback),
      replayed: result.kind === 'already_failed',
      retriesRemain: result.kind === 'retry_scheduled',
    };
  }

  async #replayCreate(record, requestHash) {
    this.#assertIdempotencyMatch(record, requestHash, 'callback_create');
    const callbackId = record.resourceId || record.responseBody?.callbackId;
    const callback = callbackId
      ? await this.callbackRepository.findById(callbackId)
      : null;

    if (!callback) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    return {
      callback: toCreateResponse(callback),
      replayed: true,
    };
  }

  async #replayDetail(record, requestHash, expectedScope) {
    this.#assertIdempotencyMatch(record, requestHash, expectedScope);
    const callbackId = record.resourceId || record.responseBody?.callbackId;
    const callback = callbackId
      ? await this.callbackRepository.findById(callbackId)
      : null;

    if (!callback) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    return {
      callback: toCallbackDetail(callback),
      replayed: true,
    };
  }

  #assertIdempotencyMatch(record, requestHash, expectedScope) {
    if (!record) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    if (record.scope && record.scope !== expectedScope) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    if (record.requestHash && record.requestHash !== requestHash) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }
  }

  #idempotencyExpiry() {
    return new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
  }

  #hashPayload(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

module.exports = CallbackService;
