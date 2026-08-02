const { Prisma } = require('@prisma/client');
const { prisma } = require('../config/database');

const NOT_DELETED = { deletedAt: null };

const ACTIVE_APPOINTMENT_STATUSES = Object.freeze(['PENDING', 'CONFIRMED']);

const APPOINTMENT_SUMMARY_SELECT = Object.freeze({
  id: true,
  status: true,
  source: true,
  doctorId: true,
  branchId: true,
  departmentId: true,
  slotId: true,
  startsAt: true,
  endsAt: true,
  visitReason: true,
  createdAt: true,
  updatedAt: true,
  doctor: {
    select: {
      displayName: true,
    },
  },
  branch: {
    select: {
      name: true,
    },
  },
});

class PatientRepository {
  /**
   * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #db(tx) {
    return tx || this.prisma;
  }

  async findById(patientId, { tx } = {}) {
    if (!patientId) {
      return null;
    }

    return this.#db(tx).patient.findFirst({
      where: { id: patientId, ...NOT_DELETED },
    });
  }

  /**
   * Uses the unique phoneE164 index, then applies soft-delete filtering in memory.
   */
  async findByPhoneE164(phoneE164, { tx } = {}) {
    if (!phoneE164) {
      return null;
    }

    const patient = await this.#db(tx).patient.findUnique({
      where: { phoneE164 },
    });

    if (!patient || patient.deletedAt) {
      return null;
    }

    return patient;
  }

  /**
   * Includes soft-deleted rows (for unique-constraint conflict diagnosis only).
   */
  async findByPhoneE164Any(phoneE164, { tx } = {}) {
    if (!phoneE164) {
      return null;
    }

    return this.#db(tx).patient.findUnique({
      where: { phoneE164 },
    });
  }

  async findByPhone(phone, { tx } = {}) {
    if (!phone) {
      return null;
    }

    return this.#db(tx).patient.findFirst({
      where: {
        ...NOT_DELETED,
        OR: [{ phone }, { phoneE164: phone }],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Name / DOB search for returning-patient lookup.
   */
  async searchByNameDob({ fullName, dateOfBirth }, { tx } = {}) {
    if (!fullName && !dateOfBirth) {
      return [];
    }

    const where = {
      ...NOT_DELETED,
    };

    if (fullName) {
      const normalizedName = fullName.trim();
      const parts = normalizedName.split(/\s+/).filter(Boolean);
      const nameFilters = [{ fullName: { equals: normalizedName, mode: 'insensitive' } }];

      if (parts.length >= 2) {
        nameFilters.push({
          AND: [
            { firstName: { equals: parts[0], mode: 'insensitive' } },
            { lastName: { equals: parts.slice(1).join(' '), mode: 'insensitive' } },
          ],
        });
      }

      where.OR = nameFilters;
    }

    if (dateOfBirth) {
      where.dateOfBirth = new Date(`${dateOfBirth}T00:00:00.000Z`);
    }

    return this.#db(tx).patient.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
    });
  }

  async create(data, { tx } = {}) {
    return this.#db(tx).patient.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullName: data.fullName,
        phone: data.phone,
        phoneE164: data.phoneE164,
        email: data.email ?? null,
        dateOfBirth: data.dateOfBirth
          ? new Date(`${data.dateOfBirth}T00:00:00.000Z`)
          : null,
        gender: data.gender,
        preferredLanguage: data.preferredLanguage,
        notes: data.notes ?? null,
        isReturning: data.isReturning ?? false,
      },
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
        scope: record.scope || 'patient_create',
        requestHash: record.requestHash,
        responseStatus: record.responseStatus,
        responseBody: record.responseBody ?? undefined,
        resourceType: record.resourceType,
        resourceId: record.resourceId,
        expiresAt: record.expiresAt,
      },
    });
  }

  /**
   * Atomically create patient + idempotency row.
   * Handles concurrent retries on the unique idempotency key.
   */
  async createWithIdempotency({ patientData, idempotency }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingKey = await this.findIdempotencyRecord(idempotency.key, { tx });

        if (existingKey) {
          return { kind: 'idempotent_hit', record: existingKey };
        }

        const duplicatePhone = await this.findByPhoneE164(patientData.phoneE164, { tx });
        if (duplicatePhone) {
          return { kind: 'phone_conflict', patient: duplicatePhone };
        }

        const softDeletedPhone = await this.findByPhoneE164Any(patientData.phoneE164, { tx });
        if (softDeletedPhone) {
          return { kind: 'phone_inactive_conflict', patient: softDeletedPhone };
        }

        const patient = await this.create(patientData, { tx });

        const record = await this.createIdempotencyRecord(
          {
            key: idempotency.key,
            scope: idempotency.scope,
            requestHash: idempotency.requestHash,
            responseStatus: 201,
            responseBody: { patientId: patient.id },
            resourceType: 'Patient',
            resourceId: patient.id,
            expiresAt: idempotency.expiresAt,
          },
          { tx },
        );

        return { kind: 'created', patient, record };
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error, 'key')) {
        const record = await this.findIdempotencyRecord(idempotency.key);
        if (record) {
          return { kind: 'idempotent_hit', record };
        }
      }

      if (this.isUniqueConstraintError(error, 'phoneE164')) {
        const patient = await this.findByPhoneE164Any(patientData.phoneE164);
        if (patient && !patient.deletedAt) {
          return { kind: 'phone_conflict', patient };
        }
        if (patient && patient.deletedAt) {
          return { kind: 'phone_inactive_conflict', patient };
        }
      }

      throw error;
    }
  }

  /**
   * Lists appointments for a patient.
   * Default (no status/from/to): active upcoming only (PENDING|CONFIRMED, startsAt >= now).
   */
  async listAppointmentsByPatientId(patientId, { status, from, to, limit = 20 } = {}) {
    if (!patientId) {
      return [];
    }

    const where = {
      patientId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    } else {
      where.status = { in: [...ACTIVE_APPOINTMENT_STATUSES] };
    }

    if (from || to) {
      where.startsAt = {};
      if (from) {
        where.startsAt.gte = new Date(from);
      }
      if (to) {
        where.startsAt.lte = new Date(to);
      }
    } else if (!status || ACTIVE_APPOINTMENT_STATUSES.includes(status)) {
      where.startsAt = { gte: new Date() };
    }

    return this.prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SUMMARY_SELECT,
      orderBy: { startsAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Resolve a single appointment for a patient by id and/or doctor display name.
   * Returns matching rows (caller enforces exactly-one semantics).
   */
  async findAppointmentsForPatient(patientId, { appointmentId, doctorName } = {}) {
    if (!patientId) {
      return [];
    }

    const where = {
      patientId,
      deletedAt: null,
    };

    if (appointmentId) {
      where.id = appointmentId;
    } else {
      where.status = { in: [...ACTIVE_APPOINTMENT_STATUSES] };
      where.startsAt = { gte: new Date() };
    }

    if (doctorName) {
      where.doctor = {
        is: {
          displayName: {
            contains: doctorName,
            mode: 'insensitive',
          },
        },
      };
    }

    return this.prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SUMMARY_SELECT,
      orderBy: { startsAt: 'asc' },
      take: 10,
    });
  }

  /**
   * @param {unknown} error
   * @param {string} [targetField]
   */
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

module.exports = PatientRepository;
