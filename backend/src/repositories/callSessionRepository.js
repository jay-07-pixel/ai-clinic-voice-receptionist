const crypto = require('crypto');
const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/database');
const { STATUS_ACTIVE } = require('../dto/callSessionDto');

const SESSION_SUMMARY_SELECT = Object.freeze({
  id: true,
  status: true,
  direction: true,
  language: true,
  externalCallId: true,
  recoveryToken: true,
  patientId: true,
  branchId: true,
  fromNumber: true,
  toNumber: true,
  currentIntent: true,
  currentStep: true,
  startedAt: true,
  lastActivityAt: true,
  endedAt: true,
  droppedAt: true,
});

const SESSION_DETAIL_SELECT = Object.freeze({
  ...SESSION_SUMMARY_SELECT,
  promptVersion: true,
  modelVersion: true,
  transcript: true,
  summary: true,
  conversationState: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
});

const HELD_SLOT_SELECT = Object.freeze({
  id: true,
  status: true,
  holdExpiresAt: true,
  startsAt: true,
  endsAt: true,
});

function toJsonSafe(value) {
  if (value == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

class CallSessionRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #db(tx) {
    return tx || this.prisma;
  }

  createRecoveryToken() {
    return `rcv_${crypto.randomBytes(16).toString('hex')}`;
  }

  async findById(sessionId, { tx } = {}) {
    if (!sessionId) {
      return null;
    }

    return this.#db(tx).callSession.findUnique({
      where: { id: sessionId },
      select: SESSION_DETAIL_SELECT,
    });
  }

  async findByExternalCallId(externalCallId, { tx } = {}) {
    if (!externalCallId) {
      return null;
    }

    return this.#db(tx).callSession.findUnique({
      where: { externalCallId },
      select: SESSION_DETAIL_SELECT,
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

  async findHeldSlotsBySession(sessionId, { includeExpired = true, tx } = {}) {
    if (!sessionId) {
      return [];
    }

    const now = new Date();
    const where = {
      heldBySessionId: sessionId,
      status: 'HELD',
    };

    if (!includeExpired) {
      where.holdExpiresAt = { gt: now };
    }

    return this.#db(tx).appointmentSlot.findMany({
      where,
      select: HELD_SLOT_SELECT,
      orderBy: { startsAt: 'asc' },
    });
  }

  async releaseSessionHolds(sessionId, { onlyExpired = false, tx } = {}) {
    if (!sessionId) {
      return { count: 0 };
    }

    const now = new Date();
    const where = {
      heldBySessionId: sessionId,
      status: 'HELD',
    };

    if (onlyExpired) {
      where.OR = [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }];
    }

    return this.#db(tx).appointmentSlot.updateMany({
      where,
      data: {
        status: 'AVAILABLE',
        heldBySessionId: null,
        holdExpiresAt: null,
      },
    });
  }

  async createAuditLog(entry, { tx } = {}) {
    return this.#db(tx).auditLog.create({
      data: {
        actorType: entry.actorType || 'VOICE_AI',
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: 'CallSession',
        entityId: entry.entityId ?? null,
        callSessionId: entry.callSessionId ?? null,
        before: entry.before === undefined ? undefined : toJsonSafe(entry.before),
        after: entry.after === undefined ? undefined : toJsonSafe(entry.after),
        metadata: entry.metadata === undefined ? undefined : toJsonSafe(entry.metadata),
      },
      select: { id: true },
    });
  }

  async createAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        if (payload.externalCallId) {
          const existingSession = await this.findByExternalCallId(payload.externalCallId, { tx });
          if (existingSession) {
            await this.createIdempotencyRecord(
              {
                key: payload.idempotencyKey,
                scope: 'call_session_create',
                requestHash: payload.requestHash,
                responseStatus: 200,
                responseBody: { sessionId: existingSession.id },
                resourceType: 'CallSession',
                resourceId: existingSession.id,
                expiresAt: payload.idempotencyExpiresAt,
              },
              { tx },
            );
            return { kind: 'existing', session: existingSession };
          }
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

        const session = await tx.callSession.create({
          data: {
            externalCallId: payload.externalCallId ?? null,
            direction: payload.direction,
            language: payload.language || 'en',
            fromNumber: payload.fromNumber ?? payload.phone ?? null,
            toNumber: payload.toNumber ?? null,
            patientId: payload.patientId ?? null,
            branchId: payload.branchId ?? null,
            promptVersion: payload.promptVersion ?? null,
            modelVersion: payload.modelVersion ?? null,
            metadata: payload.metadata ?? undefined,
            status: STATUS_ACTIVE,
            recoveryToken: this.createRecoveryToken(),
            conversationState: {
              extractedEntities: {},
              toolHistory: [],
            },
            transcript: [],
            startedAt: now,
            lastActivityAt: now,
          },
          select: SESSION_DETAIL_SELECT,
        });

        await this.createAuditLog(
          {
            actorType: 'VOICE_AI',
            actorId: session.id,
            action: 'CREATE',
            entityId: session.id,
            callSessionId: session.id,
            before: null,
            after: session,
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'call_session_create',
            requestHash: payload.requestHash,
            responseStatus: 201,
            responseBody: { sessionId: session.id },
            resourceType: 'CallSession',
            resourceId: session.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'created', session };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'externalCallId') && payload.externalCallId) {
        const existing = await this.findByExternalCallId(payload.externalCallId);
        if (existing) {
          return { kind: 'existing', session: existing };
        }
      }
      if (this.isUniqueConstraintError(error, 'key')) {
        const record = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (record) {
          return { kind: 'idempotent_hit', record };
        }
      }
      throw error;
    }
  }

  async resumeAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const session = await this.findById(payload.sessionId, { tx });
        if (!session) {
          return { kind: 'not_found' };
        }

        if (payload.recoveryToken && session.recoveryToken !== payload.recoveryToken) {
          return { kind: 'invalid_token', session };
        }

        if (!['IN_PROGRESS', 'DROPPED'].includes(session.status)) {
          return { kind: 'conflict', session };
        }

        const heldSlots = await this.findHeldSlotsBySession(session.id, {
          includeExpired: true,
          tx,
        });

        const metadata = {
          ...(session.metadata && typeof session.metadata === 'object' ? session.metadata : {}),
          ...(payload.metadata || {}),
        };

        const updated = await tx.callSession.update({
          where: { id: session.id },
          data: {
            status: STATUS_ACTIVE,
            externalCallId: payload.externalCallId || session.externalCallId,
            droppedAt: null,
            endedAt: null,
            lastActivityAt: now,
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
            // Preserve transcript, conversationState (entities/tools/context), recoveryToken, holds.
          },
          select: SESSION_DETAIL_SELECT,
        });

        await this.createAuditLog(
          {
            actorType: 'VOICE_AI',
            actorId: updated.id,
            action: 'RECOVER_SESSION',
            entityId: updated.id,
            callSessionId: updated.id,
            before: session,
            after: updated,
            metadata: {
              reason: payload.reason || 'DROPPED_CALL',
              preservedHoldCount: heldSlots.length,
            },
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'call_session_resume',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: { sessionId: updated.id },
            resourceType: 'CallSession',
            resourceId: updated.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'resumed', session: updated, heldSlots };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'key')) {
        const record = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (record) {
          return { kind: 'idempotent_hit', record };
        }
      }
      if (this.isUniqueConstraintError(error, 'externalCallId')) {
        return { kind: 'external_call_conflict' };
      }
      throw error;
    }
  }

  async endAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const session = await this.findById(payload.sessionId, { tx });
        if (!session) {
          return { kind: 'not_found' };
        }

        if (session.status === 'COMPLETED') {
          await this.createIdempotencyRecord(
            {
              key: payload.idempotencyKey,
              scope: 'call_session_end',
              requestHash: payload.requestHash,
              responseStatus: 200,
              responseBody: { sessionId: session.id, status: 'COMPLETED' },
              resourceType: 'CallSession',
              resourceId: session.id,
              expiresAt: payload.idempotencyExpiresAt,
            },
            { tx },
          );
          return { kind: 'already_completed', session };
        }

        if (!['IN_PROGRESS', 'DROPPED', 'TRANSFERRED'].includes(session.status)) {
          return { kind: 'conflict', session };
        }

        const transcript =
          payload.transcript !== undefined ? payload.transcript : session.transcript;

        const metadata = {
          ...(session.metadata && typeof session.metadata === 'object' ? session.metadata : {}),
          ...(payload.metadata || {}),
        };

        const updated = await tx.callSession.update({
          where: { id: session.id },
          data: {
            status: 'COMPLETED',
            endedAt: now,
            lastActivityAt: now,
            summary: payload.summary ?? session.summary,
            transcript: transcript ?? [],
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          },
          select: SESSION_DETAIL_SELECT,
        });

        let releasedHoldCount = 0;
        if (payload.releaseHolds !== false) {
          // End-of-call cleanup: release any remaining holds for this session (including expired).
          const released = await this.releaseSessionHolds(session.id, {
            onlyExpired: false,
            tx,
          });
          releasedHoldCount = released.count;
        }

        await this.createAuditLog(
          {
            actorType: 'VOICE_AI',
            actorId: updated.id,
            action: 'UPDATE',
            entityId: updated.id,
            callSessionId: updated.id,
            before: session,
            after: updated,
            metadata: { releasedHoldCount },
          },
          { tx },
        );

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'call_session_end',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: { sessionId: updated.id, status: 'COMPLETED' },
            resourceType: 'CallSession',
            resourceId: updated.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'ended', session: updated, releasedHoldCount };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'key')) {
        const record = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (record) {
          return { kind: 'idempotent_hit', record };
        }
      }
      throw error;
    }
  }

  isUniqueConstraintError(error, targetField) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    if (!targetField) {
      return true;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes(targetField);
    }

    if (typeof target === 'string') {
      return target.includes(targetField);
    }

    return false;
  }
}

module.exports = CallSessionRepository;
