const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/database');
const { DEFAULT_SLOT_HOLD_MINUTES } = require('../dto/availabilityDto');

const ACTIVE_DOCTOR = Object.freeze({
  isActive: true,
  deletedAt: null,
});

const ACTIVE_BRANCH = Object.freeze({
  isActive: true,
  deletedAt: null,
});

const ACTIVE_DEPARTMENT_LINK = Object.freeze({
  isActive: true,
  department: {
    is: { isActive: true },
  },
});

const DOCTOR_ENRICHMENT_SELECT = Object.freeze({
  displayName: true,
  doctorDepartments: {
    where: ACTIVE_DEPARTMENT_LINK,
    select: {
      department: {
        select: { name: true },
      },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
});

const BRANCH_ENRICHMENT_SELECT = Object.freeze({
  name: true,
  timezone: true,
});

const SLOT_LIST_SELECT = Object.freeze({
  id: true,
  doctorId: true,
  branchId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  bufferAfterMinutes: true,
  holdExpiresAt: true,
  heldBySessionId: true,
  doctor: { select: DOCTOR_ENRICHMENT_SELECT },
  branch: { select: BRANCH_ENRICHMENT_SELECT },
});

const SLOT_HOLD_SELECT = Object.freeze({
  id: true,
  doctorId: true,
  branchId: true,
  status: true,
  holdExpiresAt: true,
  heldBySessionId: true,
  doctor: { select: DOCTOR_ENRICHMENT_SELECT },
  branch: { select: BRANCH_ENRICHMENT_SELECT },
});

class AvailabilityRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  /**
   * Slots that are free now: AVAILABLE, or HELD with an expired/missing expiry.
   */
  #effectivelyAvailableWhere(now = new Date()) {
    return {
      OR: [
        { status: 'AVAILABLE' },
        {
          status: 'HELD',
          OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }],
        },
      ],
    };
  }

  #buildSearchWhere({
    branchId,
    branchIds,
    doctorId,
    departmentId,
    clinicId,
    from,
    to,
    now = new Date(),
  } = {}) {
    const doctorFilter = {
      ...ACTIVE_DOCTOR,
    };

    if (departmentId) {
      doctorFilter.doctorDepartments = {
        some: {
          departmentId,
          ...ACTIVE_DEPARTMENT_LINK,
        },
      };
    }

    const branchFilter = {
      ...ACTIVE_BRANCH,
    };

    if (clinicId) {
      branchFilter.clinicId = clinicId;
    }

    const where = {
      AND: [this.#effectivelyAvailableWhere(now)],
      doctor: { is: doctorFilter },
      branch: { is: branchFilter },
    };

    if (from || to) {
      where.startsAt = {};
      if (from) {
        where.startsAt.gte = new Date(from);
      }
      if (to) {
        where.startsAt.lte = new Date(to);
      }
    }

    if (doctorId) {
      where.doctorId = doctorId;
    }

    if (branchIds && branchIds.length > 0) {
      where.branchId = { in: branchIds };
    } else if (branchId) {
      where.branchId = branchId;
    }

    return where;
  }

  async searchSlots(filters = {}) {
    const {
      branchId,
      doctorId,
      departmentId,
      clinicId,
      from,
      to,
      limit = 20,
      offset = 0,
    } = filters;

    const now = new Date();
    const where = this.#buildSearchWhere({
      branchId,
      doctorId,
      departmentId,
      clinicId,
      from,
      to,
      now,
    });

    const [slots, total] = await this.prisma.$transaction([
      this.prisma.appointmentSlot.findMany({
        where,
        select: SLOT_LIST_SELECT,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.appointmentSlot.count({ where }),
    ]);

    return { slots, total, now };
  }

  async findEarliestSlot(filters = {}) {
    const { clinicId, branchIds, doctorId, departmentId, from, to } = filters;
    const now = new Date();
    const where = this.#buildSearchWhere({
      clinicId,
      branchIds,
      doctorId,
      departmentId,
      from,
      to,
      now,
    });

    return this.prisma.appointmentSlot.findFirst({
      where,
      select: SLOT_LIST_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findSlotById(slotId, { tx } = {}) {
    if (!slotId) {
      return null;
    }

    const db = tx || this.prisma;
    return db.appointmentSlot.findUnique({
      where: { id: slotId },
      select: SLOT_HOLD_SELECT,
    });
  }

  async callSessionExists(callSessionId, { tx } = {}) {
    if (!callSessionId) {
      return false;
    }

    const db = tx || this.prisma;
    const session = await db.callSession.findUnique({
      where: { id: callSessionId },
      select: { id: true },
    });

    return Boolean(session);
  }

  async getHoldMinutesForSlot(slotId, { tx } = {}) {
    const db = tx || this.prisma;

    const slot = await db.appointmentSlot.findUnique({
      where: { id: slotId },
      select: {
        id: true,
        branch: {
          select: {
            clinic: {
              select: {
                settings: {
                  select: { slotHoldMinutes: true },
                },
              },
            },
          },
        },
      },
    });

    if (!slot) {
      return { found: false, holdMinutes: DEFAULT_SLOT_HOLD_MINUTES };
    }

    const minutes = slot.branch?.clinic?.settings?.slotHoldMinutes;
    return {
      found: true,
      holdMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_SLOT_HOLD_MINUTES,
    };
  }

  async findIdempotencyRecord(key, { tx } = {}) {
    if (!key) {
      return null;
    }

    const db = tx || this.prisma;
    return db.idempotencyRecord.findUnique({
      where: { key },
    });
  }

  async createIdempotencyRecord(record, { tx } = {}) {
    const db = tx || this.prisma;
    return db.idempotencyRecord.create({
      data: {
        key: record.key,
        scope: record.scope,
        requestHash: record.requestHash,
        responseStatus: record.responseStatus,
        responseBody: record.responseBody,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        expiresAt: record.expiresAt,
      },
    });
  }

  /**
   * Atomically hold a slot if it is AVAILABLE, an expired HELD slot,
   * or already held by the same call session (renew).
   * Hold duration is resolved inside the transaction.
   */
  async holdSlotAtomic({ slotId, callSessionId, idempotency }) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (idempotency?.key) {
          const existing = await this.findIdempotencyRecord(idempotency.key, { tx });
          if (existing) {
            return { kind: 'idempotent_hit', record: existing, now };
          }
        }

        const sessionExists = await this.callSessionExists(callSessionId, { tx });
        if (!sessionExists) {
          return { kind: 'session_not_found', now };
        }

        const holdConfig = await this.getHoldMinutesForSlot(slotId, { tx });
        if (!holdConfig.found) {
          return { kind: 'not_found', now };
        }

        const holdExpiresAt = new Date(now.getTime() + holdConfig.holdMinutes * 60 * 1000);

        const updated = await tx.appointmentSlot.updateMany({
          where: {
            id: slotId,
            OR: [
              { status: 'AVAILABLE' },
              {
                status: 'HELD',
                OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }],
              },
              {
                status: 'HELD',
                heldBySessionId: callSessionId,
              },
            ],
          },
          data: {
            status: 'HELD',
            heldBySessionId: callSessionId,
            holdExpiresAt,
          },
        });

        if (updated.count === 0) {
          const slot = await this.findSlotById(slotId, { tx });
          if (!slot) {
            return { kind: 'not_found', now };
          }
          return { kind: 'unavailable', slot, now };
        }

        const slot = await this.findSlotById(slotId, { tx });

        if (idempotency?.key) {
          await this.createIdempotencyRecord(
            {
              key: idempotency.key,
              scope: idempotency.scope,
              requestHash: idempotency.requestHash,
              responseStatus: 200,
              responseBody: {
                slotId: slot.id,
                status: slot.status,
                holdExpiresAt: slot.holdExpiresAt,
                doctorId: slot.doctorId,
                branchId: slot.branchId,
              },
              resourceType: 'AppointmentSlot',
              resourceId: slot.id,
              expiresAt: idempotency.expiresAt,
            },
            { tx },
          );
        }

        return { kind: 'held', slot, now };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'key') && idempotency?.key) {
        const record = await this.findIdempotencyRecord(idempotency.key);
        if (record) {
          return { kind: 'idempotent_hit', record, now: new Date() };
        }
      }

      if (this.isForeignKeyError(error)) {
        return { kind: 'session_not_found', now: new Date() };
      }

      throw error;
    }
  }

  /**
   * Atomically release a hold owned by callSessionId.
   * Idempotent when the slot is already AVAILABLE.
   */
  async releaseSlotAtomic({ slotId, callSessionId, idempotency }) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (idempotency?.key) {
          const existing = await this.findIdempotencyRecord(idempotency.key, { tx });
          if (existing) {
            return { kind: 'idempotent_hit', record: existing, now };
          }
        }

        const slot = await this.findSlotById(slotId, { tx });
        if (!slot) {
          return { kind: 'not_found', now };
        }

        if (slot.status === 'BOOKED' || slot.status === 'BLOCKED') {
          return { kind: 'conflict', slot, now };
        }

        if (slot.status === 'AVAILABLE') {
          if (idempotency?.key) {
            await this.createIdempotencyRecord(
              {
                key: idempotency.key,
                scope: idempotency.scope,
                requestHash: idempotency.requestHash,
                responseStatus: 200,
                responseBody: { slotId: slot.id, status: 'AVAILABLE' },
                resourceType: 'AppointmentSlot',
                resourceId: slot.id,
                expiresAt: idempotency.expiresAt,
              },
              { tx },
            );
          }
          return { kind: 'released', slot, now };
        }

        const isOwner = slot.heldBySessionId === callSessionId;
        const isExpired =
          !slot.holdExpiresAt || new Date(slot.holdExpiresAt).getTime() <= now.getTime();

        if (!isOwner && !isExpired) {
          return { kind: 'forbidden_hold', slot, now };
        }

        const updated = await tx.appointmentSlot.updateMany({
          where: {
            id: slotId,
            status: 'HELD',
            OR: [
              { heldBySessionId: callSessionId },
              {
                OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }],
              },
            ],
          },
          data: {
            status: 'AVAILABLE',
            heldBySessionId: null,
            holdExpiresAt: null,
          },
        });

        if (updated.count === 0) {
          const latest = await this.findSlotById(slotId, { tx });
          if (latest?.status === 'AVAILABLE') {
            return { kind: 'released', slot: latest, now };
          }
          return { kind: 'conflict', slot: latest || slot, now };
        }

        const released = await this.findSlotById(slotId, { tx });

        if (idempotency?.key) {
          await this.createIdempotencyRecord(
            {
              key: idempotency.key,
              scope: idempotency.scope,
              requestHash: idempotency.requestHash,
              responseStatus: 200,
              responseBody: { slotId: released.id, status: released.status },
              resourceType: 'AppointmentSlot',
              resourceId: released.id,
              expiresAt: idempotency.expiresAt,
            },
            { tx },
          );
        }

        return { kind: 'released', slot: released, now };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'key') && idempotency?.key) {
        const record = await this.findIdempotencyRecord(idempotency.key);
        if (record) {
          return { kind: 'idempotent_hit', record, now: new Date() };
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

  isForeignKeyError(error) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
  }
}

module.exports = AvailabilityRepository;
