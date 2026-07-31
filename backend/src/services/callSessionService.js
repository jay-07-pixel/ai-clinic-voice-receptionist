const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const CallSessionRepository = require('../repositories/callSessionRepository');
const { IDEMPOTENCY_TTL_HOURS } = require('../dto/callSessionDto');
const {
  toCallSessionDetail,
  toCreateResponse,
} = require('../mappers/callSessionMapper');

class CallSessionService {
  /**
   * @param {CallSessionRepository} [callSessionRepository]
   */
  constructor(callSessionRepository = new CallSessionRepository()) {
    this.callSessionRepository = callSessionRepository;
  }

  async createSession(dto) {
    const requestHash = this.#hashPayload({
      action: 'create',
      externalCallId: dto.externalCallId || null,
      direction: dto.direction,
      language: dto.language,
      fromNumber: dto.fromNumber || null,
      toNumber: dto.toNumber || null,
      patientId: dto.patientId || null,
      branchId: dto.branchId || null,
    });

    const result = await this.callSessionRepository.createAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapCreateResult(result, requestHash);
  }

  async getSession(sessionId) {
    const session = await this.callSessionRepository.findById(sessionId);

    if (!session) {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    const heldSlots = await this.callSessionRepository.findHeldSlotsBySession(sessionId, {
      includeExpired: false,
    });

    return toCallSessionDetail(session, heldSlots);
  }

  async resumeSession(dto) {
    const requestHash = this.#hashPayload({
      action: 'resume',
      sessionId: dto.sessionId,
      externalCallId: dto.externalCallId || null,
      recoveryToken: dto.recoveryToken || null,
      reason: dto.reason || null,
    });

    const result = await this.callSessionRepository.resumeAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapResumeResult(result, requestHash);
  }

  async endSession(dto) {
    const requestHash = this.#hashPayload({
      action: 'end',
      sessionId: dto.sessionId,
      summary: dto.summary || null,
      releaseHolds: dto.releaseHolds !== false,
    });

    const result = await this.callSessionRepository.endAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapEndResult(result, requestHash);
  }

  async #mapCreateResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayCreate(result.record, requestHash);
    }

    if (result.kind === 'existing') {
      return {
        callSession: toCreateResponse(result.session),
        replayed: true,
      };
    }

    if (result.kind === 'patient_not_found') {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'branch_not_found') {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind !== 'created' || !result.session) {
      throw new AppError('Unable to create call session', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callSession: toCreateResponse(result.session),
      replayed: false,
    };
  }

  async #mapResumeResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayDetail(result.record, requestHash, 'call_session_resume');
    }

    if (result.kind === 'not_found') {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'invalid_token') {
      throw new AppError('Invalid recovery token', 409, { code: 'CONFLICT' });
    }

    if (result.kind === 'conflict') {
      throw new AppError('Call session cannot be resumed in its current state', 409, {
        code: 'CONFLICT',
        details: { status: result.session?.status },
      });
    }

    if (result.kind === 'external_call_conflict') {
      throw new AppError('externalCallId is already linked to another session', 409, {
        code: 'CONFLICT',
      });
    }

    if (result.kind !== 'resumed' || !result.session) {
      throw new AppError('Unable to resume call session', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callSession: toCallSessionDetail(result.session, result.heldSlots || []),
      replayed: false,
    };
  }

  async #mapEndResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayDetail(result.record, requestHash, 'call_session_end');
    }

    if (result.kind === 'not_found') {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'already_completed') {
      return {
        callSession: toCallSessionDetail(result.session, []),
        replayed: true,
      };
    }

    if (result.kind === 'conflict') {
      throw new AppError('Call session cannot be ended in its current state', 409, {
        code: 'CONFLICT',
        details: { status: result.session?.status },
      });
    }

    if (result.kind !== 'ended' || !result.session) {
      throw new AppError('Unable to end call session', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      callSession: toCallSessionDetail(result.session, []),
      releasedHoldCount: result.releasedHoldCount || 0,
      replayed: false,
    };
  }

  async #replayCreate(record, requestHash) {
    this.#assertIdempotencyMatch(record, requestHash, 'call_session_create');
    const sessionId = record.resourceId || record.responseBody?.sessionId;
    const session = sessionId
      ? await this.callSessionRepository.findById(sessionId)
      : null;

    if (!session) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    return {
      callSession: toCreateResponse(session),
      replayed: true,
    };
  }

  async #replayDetail(record, requestHash, expectedScope) {
    this.#assertIdempotencyMatch(record, requestHash, expectedScope);
    const sessionId = record.resourceId || record.responseBody?.sessionId;
    const session = sessionId
      ? await this.callSessionRepository.findById(sessionId)
      : null;

    if (!session) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    const heldSlots =
      session.status === 'IN_PROGRESS'
        ? await this.callSessionRepository.findHeldSlotsBySession(session.id, {
            includeExpired: false,
          })
        : [];

    return {
      callSession: toCallSessionDetail(session, heldSlots),
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

module.exports = CallSessionService;
