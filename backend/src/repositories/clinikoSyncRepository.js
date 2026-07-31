const { prisma } = require('../config/database');
const { SYNC_SELECT, RETRY_BACKOFF_MS } = require('../dto/clinikoDto');

function toJsonSafe(value) {
  if (value == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

function backoffMsForAttempt(attemptCount) {
  const index = Math.max(0, Math.min((attemptCount || 1) - 1, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[index];
}

const APPOINTMENT_SYNC_SELECT = Object.freeze({
  id: true,
  status: true,
  patientId: true,
  doctorId: true,
  branchId: true,
  departmentId: true,
  startsAt: true,
  endsAt: true,
  visitReason: true,
  notes: true,
  cancellationReason: true,
  cancelledAt: true,
  clinikoId: true,
  metadata: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fullName: true,
      phone: true,
      phoneE164: true,
      email: true,
      dateOfBirth: true,
      notes: true,
      clinikoId: true,
    },
  },
  doctor: {
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      clinikoId: true,
    },
  },
  branch: {
    select: {
      id: true,
      name: true,
      clinikoId: true,
    },
  },
});

/**
 * Prisma access for Cliniko sync only.
 */
class ClinikoSyncRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #db(tx) {
    return tx || this.prisma;
  }

  async findById(id, { tx } = {}) {
    if (!id) {
      return null;
    }
    return this.#db(tx).clinikoSync.findUnique({
      where: { id },
      select: SYNC_SELECT,
    });
  }

  async findByEntity(entityType, localId, { tx } = {}) {
    return this.#db(tx).clinikoSync.findUnique({
      where: {
        entityType_localId: { entityType, localId },
      },
      select: SYNC_SELECT,
    });
  }

  async findByClinikoId(clinikoId, { tx } = {}) {
    if (!clinikoId) {
      return null;
    }

    return this.#db(tx).clinikoSync.findFirst({
      where: { clinikoId: String(clinikoId) },
      select: SYNC_SELECT,
    });
  }

  async list(filters = {}) {
    const where = {};

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters.localId) {
      where.localId = filters.localId;
    }

    const [records, total] = await Promise.all([
      this.prisma.clinikoSync.findMany({
        where,
        select: SYNC_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: filters.limit,
        skip: filters.offset,
      }),
      this.prisma.clinikoSync.count({ where }),
    ]);

    return { records, total };
  }

  /**
   * Enqueue / re-queue a sync row. Resets attemptCount on re-queue.
   */
  async enqueue({ entityType, localId, direction = 'OUTBOUND', force = false, metadata } = {}) {
    const existing = await this.findByEntity(entityType, localId);

    if (existing && existing.status === 'IN_PROGRESS' && !force) {
      return { kind: 'in_progress', record: existing };
    }

    if (
      existing &&
      existing.status === 'SUCCESS' &&
      !force
    ) {
      return { kind: 'already_success', record: existing };
    }

    const record = await this.prisma.clinikoSync.upsert({
      where: {
        entityType_localId: { entityType, localId },
      },
      create: {
        entityType,
        localId,
        direction,
        status: 'PENDING',
        attemptCount: 0,
        errorMessage: null,
        metadata: metadata ?? undefined,
      },
      update: {
        direction,
        status: 'PENDING',
        attemptCount: 0,
        errorMessage: null,
        lastAttemptAt: null,
        ...(metadata !== undefined ? { metadata: toJsonSafe(metadata) } : {}),
      },
      select: SYNC_SELECT,
    });

    return { kind: 'enqueued', record };
  }

  /**
   * Claim due PENDING rows safely (conditional update prevents double-claim).
   */
  async claimDueBatch(limit, { now = new Date() } = {}) {
    const candidates = await this.prisma.clinikoSync.findMany({
      where: {
        status: 'PENDING',
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: now } }],
      },
      select: { id: true, attemptCount: true, lastAttemptAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.max(limit * 3, limit),
    });

    const due = candidates.filter((row) => {
      if (!row.lastAttemptAt) {
        return true;
      }
      // After transient re-queue, lastAttemptAt is set to "next eligible at".
      return row.lastAttemptAt.getTime() <= now.getTime();
    }).slice(0, limit);

    const claimed = [];

    for (const row of due) {
      const result = await this.prisma.clinikoSync.updateMany({
        where: {
          id: row.id,
          status: 'PENDING',
        },
        data: {
          status: 'IN_PROGRESS',
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
          errorMessage: null,
        },
      });

      if (result.count === 1) {
        const record = await this.findById(row.id);
        if (record) {
          claimed.push(record);
        }
      }
    }

    return claimed;
  }

  async markSuccess(id, { clinikoId, requestPayload, responsePayload, payloadHash, metadata } = {}) {
    return this.prisma.$transaction(async (tx) => {
      return tx.clinikoSync.update({
        where: { id },
        data: {
          status: 'SUCCESS',
          clinikoId: clinikoId ?? undefined,
          lastSyncedAt: new Date(),
          lastAttemptAt: new Date(),
          errorMessage: null,
          requestPayload: requestPayload === undefined ? undefined : toJsonSafe(requestPayload),
          responsePayload: responsePayload === undefined ? undefined : toJsonSafe(responsePayload),
          payloadHash: payloadHash ?? undefined,
          metadata: metadata === undefined ? undefined : toJsonSafe(metadata),
        },
        select: SYNC_SELECT,
      });
    });
  }

  /**
   * Transient failure → PENDING with nextAttemptAt encoded in lastAttemptAt.
   * Permanent / exhausted → FAILED.
   */
  async markFailure(id, {
    errorMessage,
    errorCode,
    retryable,
    attemptCount,
    maxAttempts,
    requestPayload,
    responsePayload,
    metadata,
  } = {}) {
    const now = new Date();
    const exhausted = (attemptCount || 0) >= (maxAttempts || 5);
    const shouldRetry = retryable && !exhausted;

    const nextAttemptAt = shouldRetry
      ? new Date(now.getTime() + backoffMsForAttempt(attemptCount || 1))
      : now;

    return this.prisma.$transaction(async (tx) => {
      return tx.clinikoSync.update({
        where: { id },
        data: {
          status: shouldRetry ? 'PENDING' : 'FAILED',
          errorMessage: errorMessage || errorCode || 'Sync failed',
          lastAttemptAt: nextAttemptAt,
          requestPayload: requestPayload === undefined ? undefined : toJsonSafe(requestPayload),
          responsePayload: responsePayload === undefined ? undefined : toJsonSafe(responsePayload),
          metadata: metadata === undefined
            ? undefined
            : toJsonSafe({
                ...asMeta(metadata),
                lastErrorCode: errorCode || null,
                retryable: Boolean(retryable),
              }),
        },
        select: SYNC_SELECT,
      });
    });
  }

  async findAppointmentForSync(localId) {
    return this.prisma.appointment.findFirst({
      where: { id: localId, deletedAt: null },
      select: APPOINTMENT_SYNC_SELECT,
    });
  }

  async findPatientForSync(localId) {
    return this.prisma.patient.findFirst({
      where: { id: localId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        fullName: true,
        phone: true,
        phoneE164: true,
        email: true,
        dateOfBirth: true,
        notes: true,
        clinikoId: true,
      },
    });
  }

  async setAppointmentClinikoId(appointmentId, clinikoId) {
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { clinikoId: String(clinikoId) },
      select: { id: true, clinikoId: true },
    });
  }

  async setPatientClinikoId(patientId, clinikoId) {
    return this.prisma.patient.update({
      where: { id: patientId },
      data: { clinikoId: String(clinikoId) },
      select: { id: true, clinikoId: true },
    });
  }

  async createAuditLog(entry) {
    return this.prisma.auditLog.create({
      data: {
        actorType: entry.actorType || 'CLINIKO',
        actorId: entry.actorId ?? null,
        action: entry.action || 'SYNC',
        entityType: entry.entityType || 'ClinikoSync',
        entityId: entry.entityId ?? null,
        before: entry.before === undefined ? undefined : toJsonSafe(entry.before),
        after: entry.after === undefined ? undefined : toJsonSafe(entry.after),
        metadata: entry.metadata === undefined ? undefined : toJsonSafe(entry.metadata),
      },
      select: { id: true },
    });
  }
}

function asMeta(metadata) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata;
  }
  return {};
}

module.exports = ClinikoSyncRepository;
