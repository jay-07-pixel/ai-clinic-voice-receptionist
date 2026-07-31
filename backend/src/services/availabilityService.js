const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const AvailabilityRepository = require('../repositories/availabilityRepository');
const {
  toSlotListItem,
  toEarliestSlot,
  toHoldResponse,
  toReleaseResponse,
  computeRemainingSeconds,
  toIsoDateTime,
} = require('../mappers/availabilityMapper');

const HOLD_IDEMPOTENCY_SCOPE = 'slot_hold';
const RELEASE_IDEMPOTENCY_SCOPE = 'slot_release';
const IDEMPOTENCY_TTL_HOURS = 24;

class AvailabilityService {
  /**
   * @param {AvailabilityRepository} [availabilityRepository]
   */
  constructor(availabilityRepository = new AvailabilityRepository()) {
    this.availabilityRepository = availabilityRepository;
  }

  async searchAvailability(filters) {
    const { slots, total } = await this.availabilityRepository.searchSlots(filters);
    const items = slots.map((slot) => toSlotListItem(slot)).filter(Boolean);

    return {
      slots: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        count: items.length,
        hasMore: filters.offset + items.length < total,
      },
    };
  }

  async findEarliest(filters) {
    const slot = await this.availabilityRepository.findEarliestSlot(filters);

    if (!slot) {
      return {
        found: false,
        slot: null,
      };
    }

    return {
      found: true,
      slot: toEarliestSlot(slot),
    };
  }

  async holdSlot({ slotId, callSessionId, idempotencyKey }) {
    const requestHash = this.#hashPayload({ slotId, callSessionId, action: 'hold' });

    const result = await this.availabilityRepository.holdSlotAtomic({
      slotId,
      callSessionId,
      idempotency: idempotencyKey
        ? {
            key: idempotencyKey,
            scope: HOLD_IDEMPOTENCY_SCOPE,
            requestHash,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
          }
        : null,
    });

    return await this.#mapHoldResult(result, requestHash);
  }

  async releaseSlot({ slotId, callSessionId, idempotencyKey }) {
    const requestHash = this.#hashPayload({ slotId, callSessionId, action: 'release' });

    const result = await this.availabilityRepository.releaseSlotAtomic({
      slotId,
      callSessionId,
      idempotency: idempotencyKey
        ? {
            key: idempotencyKey,
            scope: RELEASE_IDEMPOTENCY_SCOPE,
            requestHash,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
          }
        : null,
    });

    return await this.#mapReleaseResult(result, requestHash);
  }

  async #mapHoldResult(result, requestHash) {
    const now = result.now || new Date();

    if (result.kind === 'idempotent_hit') {
      return this.#replayIdempotency(result.record, requestHash, HOLD_IDEMPOTENCY_SCOPE, now);
    }

    if (result.kind === 'not_found') {
      throw new AppError('Slot not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'session_not_found') {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'unavailable') {
      throw new AppError('Slot is not available to hold', 409, {
        code: 'SLOT_UNAVAILABLE',
        details: {
          slotId: result.slot?.id,
          status: result.slot?.status,
          remainingSeconds: computeRemainingSeconds(result.slot?.holdExpiresAt, now),
        },
      });
    }

    return toHoldResponse(result.slot, now);
  }

  async #mapReleaseResult(result, requestHash) {
    const now = result.now || new Date();

    if (result.kind === 'idempotent_hit') {
      return this.#replayIdempotency(result.record, requestHash, RELEASE_IDEMPOTENCY_SCOPE, now);
    }

    if (result.kind === 'not_found') {
      throw new AppError('Slot not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'forbidden_hold') {
      throw new AppError('Slot hold is owned by another call session', 409, {
        code: 'CONFLICT',
        details: {
          slotId: result.slot?.id,
          remainingSeconds: computeRemainingSeconds(result.slot?.holdExpiresAt, now),
        },
      });
    }

    if (result.kind === 'conflict') {
      throw new AppError('Slot cannot be released in its current state', 409, {
        code: 'CONFLICT',
        details: {
          slotId: result.slot?.id,
          status: result.slot?.status,
        },
      });
    }

    return toReleaseResponse(result.slot);
  }

  async #replayIdempotency(record, requestHash, expectedScope, now = new Date()) {
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

    if (record.resourceId) {
      const slot = await this.availabilityRepository.findSlotById(record.resourceId);
      if (slot) {
        return expectedScope === HOLD_IDEMPOTENCY_SCOPE
          ? toHoldResponse(slot, now)
          : toReleaseResponse(slot);
      }
    }

    if (record.responseBody && typeof record.responseBody === 'object') {
      const body = record.responseBody;
      if (body.slotId) {
        if (expectedScope === HOLD_IDEMPOTENCY_SCOPE) {
          return {
            slotId: body.slotId,
            status: body.status || 'HELD',
            holdExpiresAt: toIsoDateTime(body.holdExpiresAt),
            remainingSeconds: computeRemainingSeconds(body.holdExpiresAt, now),
            doctorId: body.doctorId ?? null,
            branchId: body.branchId ?? null,
            doctorName: null,
            branchName: null,
            departmentNames: [],
            timezone: null,
          };
        }

        return {
          slotId: body.slotId,
          status: body.status || 'AVAILABLE',
          remainingSeconds: 0,
        };
      }
    }

    throw new AppError(
      'Idempotency key was already used with a different payload',
      409,
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
  }

  #hashPayload(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}

module.exports = AvailabilityService;
