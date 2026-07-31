const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const { normalizeToE164 } = require('../utils/phone');
const PatientRepository = require('../repositories/patientRepository');
const {
  toPatientResponse,
  toPatientCreateResponse,
  toAppointmentSummary,
} = require('../mappers/patientMapper');

const IDEMPOTENCY_SCOPE = 'patient_create';
const IDEMPOTENCY_TTL_HOURS = 24;

class PatientService {
  /**
   * @param {PatientRepository} [patientRepository]
   */
  constructor(patientRepository = new PatientRepository()) {
    this.patientRepository = patientRepository;
  }

  /**
   * Returning-patient lookup. Soft-miss returns found:false (HTTP 200).
   */
  async lookupPatient({ phone, fullName, dateOfBirth } = {}) {
    const phoneE164 = phone ? normalizeToE164(phone) : null;

    if (phoneE164) {
      const byE164 = await this.patientRepository.findByPhoneE164(phoneE164);
      if (byE164) {
        return this.#found(byE164, 'high');
      }

      const byPhone = await this.patientRepository.findByPhone(phone.trim());
      if (byPhone) {
        return this.#found(byPhone, 'high');
      }
    } else if (phone) {
      const byPhone = await this.patientRepository.findByPhone(phone.trim());
      if (byPhone) {
        return this.#found(byPhone, 'medium');
      }
    }

    if (fullName) {
      const matches = await this.patientRepository.searchByNameDob({
        fullName: fullName.trim(),
        dateOfBirth,
      });

      if (matches.length === 1) {
        return this.#found(matches[0], dateOfBirth ? 'high' : 'medium');
      }

      if (matches.length > 1) {
        return this.#found(matches[0], 'low');
      }
    }

    return {
      found: false,
      patient: null,
      matchConfidence: null,
    };
  }

  /**
   * Register a new patient. Enforces unique phoneE164 and optional idempotency.
   */
  async createPatient(dto) {
    const phoneE164 = normalizeToE164(dto.phone);

    if (!phoneE164 || phoneE164.replace(/\D/g, '').length < 8) {
      throw new AppError('phone could not be normalized to a valid E.164 number', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    const requestHash = this.#hashCreateRequest({ ...dto, phoneE164 });
    const patientData = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      fullName: dto.fullName,
      phone: dto.phone.trim(),
      phoneE164,
      email: dto.email || null,
      dateOfBirth: dto.dateOfBirth || null,
      gender: dto.gender || 'UNKNOWN',
      preferredLanguage: dto.preferredLanguage || 'en',
      notes: dto.notes || null,
      isReturning: false,
    };

    try {
      if (dto.idempotencyKey) {
        const result = await this.patientRepository.createWithIdempotency({
          patientData,
          idempotency: {
            key: dto.idempotencyKey,
            scope: IDEMPOTENCY_SCOPE,
            requestHash,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
          },
        });

        return await this.#mapCreateResult(result, requestHash);
      }

      const duplicate = await this.patientRepository.findByPhoneE164(phoneE164);
      if (duplicate) {
        throw this.#phoneConflictError(duplicate);
      }

      const inactive = await this.patientRepository.findByPhoneE164Any(phoneE164);
      if (inactive) {
        throw this.#phoneInactiveConflictError(inactive);
      }

      const patient = await this.patientRepository.create(patientData);
      return {
        patient: toPatientCreateResponse(patient),
        replayed: false,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (this.patientRepository.isUniqueConstraintError(error, 'phoneE164')) {
        const existing = await this.patientRepository.findByPhoneE164Any(phoneE164);
        if (existing?.deletedAt) {
          throw this.#phoneInactiveConflictError(existing);
        }
        throw this.#phoneConflictError(existing);
      }

      throw error;
    }
  }

  async getPatientById(patientId) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }

    return toPatientResponse(patient);
  }

  async listPatientAppointments(patientId, filters = {}) {
    const patient = await this.patientRepository.findById(patientId);

    if (!patient) {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }

    const appointments = await this.patientRepository.listAppointmentsByPatientId(
      patientId,
      filters,
    );

    return {
      appointments: appointments.map(toAppointmentSummary),
    };
  }

  #found(patient, matchConfidence) {
    return {
      found: true,
      patient: toPatientResponse(patient),
      matchConfidence,
    };
  }

  async #mapCreateResult(result, requestHash) {
    if (result.kind === 'phone_conflict') {
      throw this.#phoneConflictError(result.patient);
    }

    if (result.kind === 'phone_inactive_conflict') {
      throw this.#phoneInactiveConflictError(result.patient);
    }

    if (result.kind === 'idempotent_hit') {
      return this.#replayFromIdempotencyRecord(result.record, requestHash);
    }

    return {
      patient: toPatientCreateResponse(result.patient),
      replayed: false,
    };
  }

  async #replayFromIdempotencyRecord(record, requestHash) {
    if (record.scope && record.scope !== IDEMPOTENCY_SCOPE) {
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

    if (!record.resourceId) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    const prior = await this.patientRepository.findById(record.resourceId);
    if (!prior) {
      throw new AppError('Patient associated with idempotency key is no longer available', 409, {
        code: 'CONFLICT',
        details: { patientId: record.resourceId },
      });
    }

    return {
      patient: toPatientCreateResponse(prior),
      replayed: true,
    };
  }

  #phoneConflictError(patient) {
    return new AppError('A patient with this phone number already exists', 409, {
      code: 'CONFLICT',
      details: patient?.id ? { patientId: patient.id } : undefined,
    });
  }

  #phoneInactiveConflictError(patient) {
    return new AppError(
      'A soft-deleted patient with this phone number already exists',
      409,
      {
        code: 'CONFLICT',
        details: patient?.id ? { patientId: patient.id, deleted: true } : { deleted: true },
      },
    );
  }

  #hashCreateRequest(payload) {
    const canonical = JSON.stringify({
      firstName: payload.firstName,
      lastName: payload.lastName,
      fullName: payload.fullName,
      phoneE164: payload.phoneE164,
      email: payload.email || null,
      dateOfBirth: payload.dateOfBirth || null,
      gender: payload.gender || 'UNKNOWN',
      preferredLanguage: payload.preferredLanguage || 'en',
    });

    return crypto.createHash('sha256').update(canonical).digest('hex');
  }
}

module.exports = PatientService;
