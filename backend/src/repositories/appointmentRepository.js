const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/database');
const config = require('../config');
const {
  ACTIVE_APPOINTMENT_STATUSES,
  DEFAULT_CANCEL_WINDOW_HOURS,
  DEFAULT_RESCHEDULE_WINDOW_HOURS,
} = require('../dto/appointmentDto');

const APPOINTMENT_SELECT = Object.freeze({
  id: true,
  status: true,
  source: true,
  patientId: true,
  doctorId: true,
  branchId: true,
  departmentId: true,
  slotId: true,
  startsAt: true,
  endsAt: true,
  visitReason: true,
  cancellationReason: true,
  cancelledAt: true,
  rescheduledFromId: true,
  callSessionId: true,
  clinikoId: true,
  createdAt: true,
  updatedAt: true,
});

const SLOT_BOOKING_SELECT = Object.freeze({
  id: true,
  doctorId: true,
  branchId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  holdExpiresAt: true,
  heldBySessionId: true,
});

function toJsonSafe(value) {
  if (value == null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

class AppointmentRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #db(tx) {
    return tx || this.prisma;
  }

  async findById(appointmentId, { tx } = {}) {
    if (!appointmentId) {
      return null;
    }

    return this.#db(tx).appointment.findFirst({
      where: { id: appointmentId, deletedAt: null },
      select: APPOINTMENT_SELECT,
    });
  }

  /**
   * Select one appointment by patient + doctor name + startsAt.
   */
  async selectAppointment({ patientId, doctorName, startsAt }) {
    if (!patientId || !doctorName || !startsAt) {
      return null;
    }

    return this.prisma.appointment.findFirst({
      where: {
        patientId,
        deletedAt: null,
        startsAt: new Date(startsAt),
        doctor: {
          is: {
            displayName: {
              contains: doctorName,
              mode: 'insensitive',
            },
          },
        },
      },
      select: {
        ...APPOINTMENT_SELECT,
        doctor: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
          },
        },
        branch: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  async findByIdempotencyKey(idempotencyKey, { tx } = {}) {
    if (!idempotencyKey) {
      return null;
    }

    return this.#db(tx).appointment.findFirst({
      where: { idempotencyKey, deletedAt: null },
      select: APPOINTMENT_SELECT,
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

  async findBookableSlot(slotId, { tx } = {}) {
    if (!slotId) {
      return null;
    }

    return this.#db(tx).appointmentSlot.findUnique({
      where: { id: slotId },
      select: SLOT_BOOKING_SELECT,
    });
  }

  async findActiveDepartment(departmentId, { tx } = {}) {
    if (!departmentId) {
      return null;
    }

    return this.#db(tx).department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { id: true },
    });
  }

  async getClinicSettingsForBranch(branchId, { tx } = {}) {
    if (!branchId) {
      return {
        cancellationWindowHours: DEFAULT_CANCEL_WINDOW_HOURS,
        rescheduleWindowHours: DEFAULT_RESCHEDULE_WINDOW_HOURS,
      };
    }

    const branch = await this.#db(tx).branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
      select: {
        id: true,
        clinic: {
          select: {
            settings: {
              select: {
                cancellationWindowHours: true,
                rescheduleWindowHours: true,
              },
            },
          },
        },
      },
    });

    return {
      cancellationWindowHours:
        branch?.clinic?.settings?.cancellationWindowHours ?? DEFAULT_CANCEL_WINDOW_HOURS,
      rescheduleWindowHours:
        branch?.clinic?.settings?.rescheduleWindowHours ?? DEFAULT_RESCHEDULE_WINDOW_HOURS,
    };
  }

  /**
   * Claim slot for booking: AVAILABLE, same-session HELD, or expired HELD.
   */
  async claimSlotAsBooked(slotId, { callSessionId, now = new Date(), tx } = {}) {
    if (!slotId) {
      return { count: 0 };
    }

    const holdOrAvailable = [
      { status: 'AVAILABLE' },
      {
        status: 'HELD',
        OR: [{ holdExpiresAt: null }, { holdExpiresAt: { lte: now } }],
      },
    ];

    if (callSessionId) {
      holdOrAvailable.push({
        status: 'HELD',
        heldBySessionId: callSessionId,
      });
    }

    return this.#db(tx).appointmentSlot.updateMany({
      where: {
        id: slotId,
        OR: holdOrAvailable,
      },
      data: {
        status: 'BOOKED',
        heldBySessionId: null,
        holdExpiresAt: null,
      },
    });
  }

  async freeBookedSlot(slotId, { tx } = {}) {
    if (!slotId) {
      return { count: 0 };
    }

    return this.#db(tx).appointmentSlot.updateMany({
      where: {
        id: slotId,
        status: 'BOOKED',
      },
      data: {
        status: 'AVAILABLE',
        heldBySessionId: null,
        holdExpiresAt: null,
      },
    });
  }

  async createAppointment(data, { tx } = {}) {
    return this.#db(tx).appointment.create({
      data: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        branchId: data.branchId,
        departmentId: data.departmentId ?? null,
        slotId: data.slotId,
        status: data.status || 'CONFIRMED',
        source: data.source || 'VOICE_AI',
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        visitReason: data.visitReason ?? null,
        callSessionId: data.callSessionId ?? null,
        rescheduledFromId: data.rescheduledFromId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
      },
      select: APPOINTMENT_SELECT,
    });
  }

  /**
   * Conditionally cancel an active appointment (prevents double-cancel races).
   */
  async cancelActiveAppointment(appointmentId, { cancellationReason, now = new Date(), tx } = {}) {
    if (!appointmentId) {
      return { count: 0 };
    }

    return this.#db(tx).appointment.updateMany({
      where: {
        id: appointmentId,
        deletedAt: null,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationReason: cancellationReason ?? null,
      },
    });
  }

  async markPatientReturning(patientId, { tx } = {}) {
    if (!patientId) {
      return { count: 0 };
    }

    return this.#db(tx).patient.updateMany({
      where: { id: patientId, deletedAt: null, isReturning: false },
      data: { isReturning: true },
    });
  }

  async createAuditLog(entry, { tx } = {}) {
    return this.#db(tx).auditLog.create({
      data: {
        actorType: entry.actorType || 'SYSTEM',
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        callSessionId: entry.callSessionId ?? null,
        requestId: entry.requestId ?? null,
        before: entry.before === undefined ? undefined : toJsonSafe(entry.before),
        after: entry.after === undefined ? undefined : toJsonSafe(entry.after),
        metadata: entry.metadata === undefined ? undefined : toJsonSafe(entry.metadata),
      },
      select: { id: true },
    });
  }

  async enqueueClinikoSync(localId, { tx } = {}) {
    if (!localId) {
      throw new Error('localId is required for ClinikoSync');
    }

    return this.#db(tx).clinikoSync.upsert({
      where: {
        entityType_localId: {
          entityType: 'APPOINTMENT',
          localId,
        },
      },
      create: {
        entityType: 'APPOINTMENT',
        localId,
        direction: 'OUTBOUND',
        status: 'PENDING',
        attemptCount: 0,
      },
      update: {
        status: 'PENDING',
        direction: 'OUTBOUND',
        errorMessage: null,
        lastAttemptAt: null,
        attemptCount: 0,
      },
      select: { id: true, status: true, localId: true },
    });
  }

  #actorFromSession(callSessionId) {
    return {
      actorType: callSessionId ? 'VOICE_AI' : 'SYSTEM',
      actorId: callSessionId || null,
      callSessionId: callSessionId || null,
    };
  }

  /**
   * Full booking unit of work.
   */
  async bookAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const byApptKey = await this.findByIdempotencyKey(payload.idempotencyKey, { tx });
        if (byApptKey) {
          return { kind: 'idempotent_appointment', appointment: byApptKey };
        }

        const patient = await this.findActivePatient(payload.patientId, { tx });
        if (!patient) {
          return { kind: 'patient_not_found' };
        }

        if (payload.departmentId) {
          const department = await this.findActiveDepartment(payload.departmentId, { tx });
          if (!department) {
            return { kind: 'department_not_found' };
          }
        }

        const slot = await this.findBookableSlot(payload.slotId, { tx });
        if (!slot) {
          return { kind: 'slot_not_found' };
        }

        if (!this.#isSlotClaimable(slot, payload.callSessionId, now)) {
          return { kind: 'slot_unavailable', slot };
        }

        const claimed = await this.claimSlotAsBooked(payload.slotId, {
          callSessionId: payload.callSessionId,
          now,
          tx,
        });

        if (claimed.count !== 1) {
          return { kind: 'slot_unavailable', slot };
        }

        const appointment = await this.createAppointment(
          {
            patientId: payload.patientId,
            doctorId: slot.doctorId,
            branchId: slot.branchId,
            departmentId: payload.departmentId,
            slotId: slot.id,
            status: 'CONFIRMED',
            source: payload.source,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            visitReason: payload.visitReason,
            callSessionId: payload.callSessionId,
            idempotencyKey: payload.idempotencyKey,
          },
          { tx },
        );

        await this.markPatientReturning(payload.patientId, { tx });

        const actor = this.#actorFromSession(payload.callSessionId);
        await this.createAuditLog(
          {
            ...actor,
            action: 'BOOK',
            entityType: 'Appointment',
            entityId: appointment.id,
            before: null,
            after: appointment,
          },
          { tx },
        );

        await this.enqueueClinikoSync(appointment.id, { tx });

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'appointment_book',
            requestHash: payload.requestHash,
            responseStatus: 201,
            responseBody: { appointmentId: appointment.id },
            resourceType: 'Appointment',
            resourceId: appointment.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'created', appointment };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'slotId')) {
        return { kind: 'slot_unavailable' };
      }
      if (
        this.isUniqueConstraintError(error, 'idempotencyKey') ||
        this.isUniqueConstraintError(error, 'key')
      ) {
        return this.#recoverIdempotentBook(payload.idempotencyKey);
      }
      throw error;
    }
  }

  async #recoverIdempotentBook(idempotencyKey) {
    const record = await this.findIdempotencyRecord(idempotencyKey);
    if (record) {
      return { kind: 'idempotent_hit', record };
    }
    const appointment = await this.findByIdempotencyKey(idempotencyKey);
    if (appointment) {
      return { kind: 'idempotent_appointment', appointment };
    }
    return { kind: 'slot_unavailable' };
  }

  /**
   * Cancel + free slot + audit + sync.
   */
  async cancelAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const appointment = await this.findById(payload.appointmentId, { tx });
        if (!appointment) {
          return { kind: 'not_found' };
        }

        if (appointment.status === 'CANCELLED') {
          await this.createIdempotencyRecord(
            {
              key: payload.idempotencyKey,
              scope: 'appointment_cancel',
              requestHash: payload.requestHash,
              responseStatus: 200,
              responseBody: { appointmentId: appointment.id, status: 'CANCELLED' },
              resourceType: 'Appointment',
              resourceId: appointment.id,
              expiresAt: payload.idempotencyExpiresAt,
            },
            { tx },
          );
          return { kind: 'already_cancelled', appointment };
        }

        if (!ACTIVE_APPOINTMENT_STATUSES.includes(appointment.status)) {
          return { kind: 'conflict', appointment };
        }

        const settings = await this.getClinicSettingsForBranch(appointment.branchId, { tx });
        if (!this.#isWithinPolicyWindow(appointment.startsAt, settings.cancellationWindowHours, now)) {
          return {
            kind: 'policy_violation',
            appointment,
            windowHours: settings.cancellationWindowHours,
          };
        }

        const cancelledCount = await this.cancelActiveAppointment(appointment.id, {
          cancellationReason: payload.cancellationReason,
          now,
          tx,
        });

        if (cancelledCount.count !== 1) {
          const latest = await this.findById(appointment.id, { tx });
          if (latest?.status === 'CANCELLED') {
            return { kind: 'already_cancelled', appointment: latest };
          }
          return { kind: 'conflict', appointment: latest || appointment };
        }

        const cancelled = await this.findById(appointment.id, { tx });

        const freed = await this.freeBookedSlot(appointment.slotId, { tx });
        if (freed.count !== 1) {
          // Slot must be freed with the cancel; fail the unit of work.
          throw new Error(`Failed to free booked slot ${appointment.slotId}`);
        }

        const actor = this.#actorFromSession(payload.callSessionId);
        await this.createAuditLog(
          {
            ...actor,
            action: 'CANCEL',
            entityType: 'Appointment',
            entityId: cancelled.id,
            before: appointment,
            after: cancelled,
          },
          { tx },
        );

        await this.enqueueClinikoSync(cancelled.id, { tx });

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'appointment_cancel',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: { appointmentId: cancelled.id, status: 'CANCELLED' },
            resourceType: 'Appointment',
            resourceId: cancelled.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return { kind: 'cancelled', appointment: cancelled };
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

  /**
   * Reschedule: claim new slot first, then cancel/free old, then create new appointment.
   */
  async rescheduleAtomic(payload) {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(payload.idempotencyKey, { tx });
        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const byApptKey = await this.findByIdempotencyKey(payload.idempotencyKey, { tx });
        if (byApptKey) {
          return { kind: 'idempotent_appointment', appointment: byApptKey };
        }

        console.log('Repository appointmentId:', payload.appointmentId);
        const previous = await this.findById(payload.appointmentId, { tx });
        console.log('Previous appointment:', previous);
        if (!previous) {
          return { kind: 'not_found' };
        }

        if (!ACTIVE_APPOINTMENT_STATUSES.includes(previous.status)) {
          return { kind: 'conflict', appointment: previous };
        }

        if (payload.newSlotId === previous.slotId) {
          return { kind: 'same_slot', appointment: previous };
        }

        const rescheduleWindowHours = config.rescheduleWindowHours;
        if (!this.#isWithinPolicyWindow(previous.startsAt, rescheduleWindowHours, now)) {
          return {
            kind: 'policy_violation',
            appointment: previous,
            windowHours: rescheduleWindowHours,
          };
        }

        const newSlot = await this.findBookableSlot(payload.newSlotId, { tx });
        if (!newSlot) {
          return { kind: 'slot_not_found' };
        }

        if (!this.#isSlotClaimable(newSlot, payload.callSessionId, now)) {
          return { kind: 'slot_unavailable', slot: newSlot };
        }

        // Claim new slot BEFORE releasing old slot so failure leaves prior booking intact.
        const claimed = await this.claimSlotAsBooked(payload.newSlotId, {
          callSessionId: payload.callSessionId,
          now,
          tx,
        });

        if (claimed.count !== 1) {
          return { kind: 'slot_unavailable', slot: newSlot };
        }

        const cancelledCount = await this.cancelActiveAppointment(previous.id, {
          cancellationReason: 'Rescheduled',
          now,
          tx,
        });

        if (cancelledCount.count !== 1) {
          return { kind: 'conflict', appointment: previous };
        }

        const cancelledPrevious = await this.findById(previous.id, { tx });

        const freed = await this.freeBookedSlot(previous.slotId, { tx });
        if (freed.count !== 1) {
          throw new Error(`Failed to free booked slot ${previous.slotId}`);
        }

        const appointment = await this.createAppointment(
          {
            patientId: previous.patientId,
            doctorId: newSlot.doctorId,
            branchId: newSlot.branchId,
            departmentId: previous.departmentId,
            slotId: newSlot.id,
            status: 'CONFIRMED',
            source: previous.source,
            startsAt: newSlot.startsAt,
            endsAt: newSlot.endsAt,
            visitReason: payload.visitReason ?? previous.visitReason,
            callSessionId: payload.callSessionId ?? previous.callSessionId,
            rescheduledFromId: previous.id,
            idempotencyKey: payload.idempotencyKey,
          },
          { tx },
        );

        const actor = this.#actorFromSession(payload.callSessionId);
        await this.createAuditLog(
          {
            ...actor,
            action: 'RESCHEDULE',
            entityType: 'Appointment',
            entityId: appointment.id,
            before: previous,
            after: appointment,
            metadata: {
              previousAppointmentId: previous.id,
              previousSlotId: previous.slotId,
              newSlotId: newSlot.id,
            },
          },
          { tx },
        );

        await this.enqueueClinikoSync(cancelledPrevious.id, { tx });
        await this.enqueueClinikoSync(appointment.id, { tx });

        await this.createIdempotencyRecord(
          {
            key: payload.idempotencyKey,
            scope: 'appointment_reschedule',
            requestHash: payload.requestHash,
            responseStatus: 200,
            responseBody: {
              previousAppointmentId: cancelledPrevious.id,
              appointmentId: appointment.id,
            },
            resourceType: 'Appointment',
            resourceId: appointment.id,
            expiresAt: payload.idempotencyExpiresAt,
          },
          { tx },
        );

        return {
          kind: 'rescheduled',
          previousAppointment: cancelledPrevious,
          appointment,
        };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'slotId')) {
        return { kind: 'slot_unavailable' };
      }
      if (
        this.isUniqueConstraintError(error, 'idempotencyKey') ||
        this.isUniqueConstraintError(error, 'key')
      ) {
        const record = await this.findIdempotencyRecord(payload.idempotencyKey);
        if (record) {
          return { kind: 'idempotent_hit', record };
        }
        const appointment = await this.findByIdempotencyKey(payload.idempotencyKey);
        if (appointment) {
          return { kind: 'idempotent_appointment', appointment };
        }
      }
      throw error;
    }
  }

  #isSlotClaimable(slot, callSessionId, now) {
    if (!slot) {
      return false;
    }

    if (slot.status === 'AVAILABLE') {
      return true;
    }

    if (slot.status !== 'HELD') {
      return false;
    }

    if (callSessionId && slot.heldBySessionId === callSessionId) {
      return true;
    }

    if (!slot.holdExpiresAt || new Date(slot.holdExpiresAt).getTime() <= now.getTime()) {
      return true;
    }

    return false;
  }

  #isWithinPolicyWindow(startsAt, windowHours, now = new Date()) {
    const startMs = new Date(startsAt).getTime();
    if (Number.isNaN(startMs)) {
      return false;
    }

    const hours = Number.isInteger(windowHours) ? windowHours : DEFAULT_CANCEL_WINDOW_HOURS;

    // 0 disables the minimum lead-time policy (dev/demo).
    if (hours === 0) {
      return true;
    }

    const deadline = startMs - hours * 60 * 60 * 1000;
    return now.getTime() <= deadline;
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

module.exports = AppointmentRepository;
