const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/database');
const { RETRY_BACKOFF_MS, MUTABLE_STATUSES } = require('../dto/callbackDto');

const PATIENT_SELECT = Object.freeze({
  id: true,
  fullName: true,
  phone: true,
  phoneE164: true,
  preferredLanguage: true,
});

const CALL_SESSION_SELECT = Object.freeze({
  id: true,
  status: true,
  direction: true,
  externalCallId: true,
  startedAt: true,
  endedAt: true,
});

const CALLBACK_SUMMARY_SELECT = Object.freeze({
  id: true,
  patientId: true,
  branchId: true,
  callSessionId: true,
  phone: true,
  phoneE164: true,
  reason: true,
  status: true,
  priority: true,
  attemptCount: true,
  maxAttempts: true,
  nextAttemptAt: true,
  lastAttemptAt: true,
  completedAt: true,
  failedAt: true,
  notes: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
});

const CALLBACK_DETAIL_SELECT = Object.freeze({
  ...CALLBACK_SUMMARY_SELECT,
  patient: { select: PATIENT_SELECT },
  callSession: { select: CALL_SESSION_SELECT },
});

function toJsonSafe(value) {
  if (value == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

function scheduledDateRange(scheduledDate) {
  if (!scheduledDate) {
    return null;
  }

  const start = new Date(`${scheduledDate}T00:00:00.000Z`);
  const end = new Date(`${scheduledDate}T23:59:59.999Z`);
  return { gte: start, lte: end };
}

function computeNextAttemptAt(attemptCount, override) {
  if (override instanceof Date && !Number.isNaN(override.getTime())) {
    return override;
  }

  const index = Math.max(0, Math.min(attemptCount - 1, RETRY_BACKOFF_MS.length - 1));
  return new Date(Date.now() + RETRY_BACKOFF_MS[index]);
}

class CallbackRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #db(tx) {
    return tx || this.prisma;
  }

  async findById(callbackId, { tx, detail = true } = {}) {
    if (!callbackId) {
      return null;
    }

    return this.#db(tx).callbackRequest.findUnique({
      where: { id: callbackId },
      select: detail ? CALLBACK_DETAIL_SELECT : CALLBACK_SUMMARY_SELECT,
    });
  }

  async findIdempotencyRecord(key, { tx } = {}) {
    if (!key) {
      return null;
    }

    return this.#db(tx).idempotencyRecord.findUnique({
      where: { key },
    });
  }

  async createIdempotencyRecord(record, { tx } = {}) {
    return this.#db(tx).idempotencyRecord.create({
      data: {
        key: record.key,
        scope: record.scope,
        requestHash: record.requestHash,
        responseStatus: record.responseStatus,
        responseBody: record.responseBody ?? undefined,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        expiresAt: record.expiresAt,
      },
    });
  }

  async findActivePatient(patientId, { tx } = {}) {
    if (!patientId) {
      return null;
    }

    return this.#db(tx).patient.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true },
    });
  }

  async findActiveBranch(branchId, { tx } = {}) {
    if (!branchId) {
      return null;
    }

    return this.#db(tx).branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
      select: { id: true },
    });
  }

  async findCallSession(callSessionId, { tx } = {}) {
    if (!callSessionId) {
      return null;
    }

    return this.#db(tx).callSession.findUnique({
      where: { id: callSessionId },
      select: { id: true },
    });
  }

  async createAuditLog(entry, { tx } = {}) {
    return this.#db(tx).auditLog.create({
      data: {
        actorType: entry.actorType || 'SYSTEM',
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: 'CallbackRequest',
        entityId: entry.entityId ?? null,
        callSessionId: entry.callSessionId ?? null,
        before: entry.before === undefined ? undefined : toJsonSafe(entry.before),
        after: entry.after === undefined ? undefined : toJsonSafe(entry.after),
        metadata: entry.metadata === undefined ? undefined : toJsonSafe(entry.metadata),
      },
      select: { id: true },
    });
  }

  async findMany(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.branchId) {
      where.branchId = filters.branchId;
    }

    if (filters.priority !== undefined && filters.priority !== null) {
      where.priority = filters.priority;
    }

    const dateRange = scheduledDateRange(filters.scheduledDate);
    if (dateRange) {
      where.nextAttemptAt = dateRange;
    }

    const [callbacks, total] = await Promise.all([
      this.prisma.callbackRequest.findMany({
        where,
        select: CALLBACK_SUMMARY_SELECT,
        orderBy: [{ priority: 'desc' }, { nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.callbackRequest.count({ where }),
    ]);

    return { callbacks, total };
  }

  async createAtomic(payload) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        if (payload.patientId) {
          const patient = await this.findActivePatient(payload.patientId, { tx });
          if (!patient) {
            return { kind: 'patient_not_found' };
          }
        }

        if (payload.branchId) {
          const branch = await this.findActiveBranch(payload.branchId, { tx });
          if (!branch) {
            return { kind: 'branch_not_found' };
          }
        }

        if (payload.callSessionId) {
          const session = await this.findCallSession(payload.callSessionId, { tx });
          if (!session) {
            return { kind: 'call_session_not_found' };
          }
        }

        const nextAttemptAt = payload.preferredTime || new Date();

        const callback = await tx.callbackRequest.create({
          data: {
            phone: payload.phone,
            phoneE164: payload.phoneE164 ?? null,
            patientId: payload.patientId ?? null,
            branchId: payload.branchId ?? null,
            callSessionId: payload.callSessionId ?? null,
            reason: payload.reason,
            status: 'PENDING',
            priority: payload.priority,
            attemptCount: 0,
            maxAttempts: payload.maxAttempts,
            nextAttemptAt,
            notes: payload.notes ?? null,
            metadata: payload.metadata ?? undefined,
          },
          select: CALLBACK_DETAIL_SELECT,
        });

        await this.createAuditLog(
          {
            actorType: 'SYSTEM',
            actorId: callback.id,
            action: 'CALLBACK',
            entityId: callback.id,
            callSessionId: callback.callSessionId,
            before: null,
            after: callback,
            metadata: { event: 'created', source: payload.source },
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'callback_create',
            requestHash: payload.requestHash,
            responseStatus: 201,
            responseBody: { callbackId: callback.id },
            resourceType: 'CallbackRequest',
            resourceId: callback.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'created', callback };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }
      }
      throw error;
    }
  }

  async completeAtomic(payload) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const existing = await this.findById(payload.callbackId, { tx, detail: true });
        if (!existing) {
          return { kind: 'not_found' };
        }

        if (existing.status === 'COMPLETED') {
          await this.createIdempotencyRecord(
            {
              key: payload.idempotencyKey,
              scope: 'callback_complete',
              requestHash: payload.requestHash,
              responseStatus: 200,
              responseBody: { callbackId: existing.id },
              resourceType: 'CallbackRequest',
              resourceId: existing.id,
              expiresAt: payload.idempotencyExpiresAt,
            },
            { tx },
          );
          return { kind: 'already_completed', callback: existing };
        }

        if (!MUTABLE_STATUSES.includes(existing.status)) {
          return { kind: 'invalid_status', callback: existing };
        }

        if (payload.callSessionId) {
          const session = await this.findCallSession(payload.callSessionId, { tx });
          if (!session) {
            return { kind: 'call_session_not_found' };
          }
        }

        const now = new Date();
        const mergedMetadata = {
          ...(existing.metadata && typeof existing.metadata === 'object'
            ? existing.metadata
            : {}),
          ...(payload.metadata || {}),
        };

        const callback = await tx.callbackRequest.update({
          where: { id: payload.callbackId },
          data: {
            status: 'COMPLETED',
            completedAt: now,
            failedAt: null,
            nextAttemptAt: null,
            callSessionId: payload.callSessionId ?? existing.callSessionId,
            notes: payload.notes ?? existing.notes,
            metadata: Object.keys(mergedMetadata).length ? mergedMetadata : undefined,
          },
          select: CALLBACK_DETAIL_SELECT,
        });

        await this.createAuditLog(
          {
            actorType: 'SYSTEM',
            actorId: callback.id,
            action: 'CALLBACK',
            entityId: callback.id,
            callSessionId: callback.callSessionId,
            before: existing,
            after: callback,
            metadata: { event: 'completed' },
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'callback_complete',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: { callbackId: callback.id },
            resourceType: 'CallbackRequest',
            resourceId: callback.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'completed', callback };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }
      }
      throw error;
    }
  }

  async failAtomic(payload) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const existing = await this.findById(payload.callbackId, { tx, detail: true });
        if (!existing) {
          return { kind: 'not_found' };
        }

        if (!MUTABLE_STATUSES.includes(existing.status) && existing.status !== 'FAILED') {
          return { kind: 'invalid_status', callback: existing };
        }

        if (existing.status === 'FAILED') {
          await this.createIdempotencyRecord(
            {
              key: payload.idempotencyKey,
              scope: 'callback_fail',
              requestHash: payload.requestHash,
              responseStatus: 200,
              responseBody: { callbackId: existing.id },
              resourceType: 'CallbackRequest',
              resourceId: existing.id,
              expiresAt: payload.idempotencyExpiresAt,
            },
            { tx },
          );
          return { kind: 'already_failed', callback: existing };
        }

        const now = new Date();
        const attemptCount = (existing.attemptCount || 0) + 1;
        const maxAttempts = existing.maxAttempts || 3;
        const retriesRemain = attemptCount < maxAttempts;

        const nextAttemptAt = retriesRemain
          ? computeNextAttemptAt(attemptCount, payload.nextAttemptAt)
          : null;

        const mergedMetadata = {
          ...(existing.metadata && typeof existing.metadata === 'object'
            ? existing.metadata
            : {}),
          ...(payload.metadata || {}),
          lastFailReason: payload.notes || null,
        };

        const callback = await tx.callbackRequest.update({
          where: { id: payload.callbackId },
          data: {
            attemptCount,
            lastAttemptAt: now,
            status: retriesRemain ? 'PENDING' : 'FAILED',
            nextAttemptAt,
            failedAt: retriesRemain ? null : now,
            notes: payload.notes ?? existing.notes,
            metadata: mergedMetadata,
          },
          select: CALLBACK_DETAIL_SELECT,
        });

        await this.createAuditLog(
          {
            actorType: 'SYSTEM',
            actorId: callback.id,
            action: 'CALLBACK',
            entityId: callback.id,
            callSessionId: callback.callSessionId,
            before: existing,
            after: callback,
            metadata: {
              event: retriesRemain ? 'retry_scheduled' : 'failed',
              attemptCount,
              maxAttempts,
              nextAttemptAt: nextAttemptAt ? nextAttemptAt.toISOString() : null,
            },
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'callback_fail',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: { callbackId: callback.id },
            resourceType: 'CallbackRequest',
            resourceId: callback.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return {
          kind: retriesRemain ? 'retry_scheduled' : 'failed',
          callback,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }
      }
      throw error;
    }
  }
}

module.exports = CallbackRepository;
