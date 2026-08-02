const crypto = require('crypto');
const { AppError } = require('../middleware/errorHandler');
const AppointmentRepository = require('../repositories/appointmentRepository');
const PatientRepository = require('../repositories/patientRepository');
const AvailabilityRepository = require('../repositories/availabilityRepository');
const { IDEMPOTENCY_TTL_HOURS } = require('../dto/appointmentDto');
const {
  toAppointmentResponse,
  toAppointmentBookResponse,
  toAppointmentCancelResponse,
  toPreviousAppointmentSummary,
  toAppointmentSelectResponse,
} = require('../mappers/appointmentMapper');

class AppointmentService {
  /**
   * @param {object} [deps]
   */
  constructor({
    appointmentRepository = new AppointmentRepository(),
    patientRepository = new PatientRepository(),
    availabilityRepository = new AvailabilityRepository(),
  } = {}) {
    this.appointmentRepository = appointmentRepository;
    this.patientRepository = patientRepository;
    this.availabilityRepository = availabilityRepository;
  }

  async getAppointmentById(appointmentId) {
    const appointment = await this.appointmentRepository.findById(appointmentId);

    if (!appointment) {
      throw new AppError('Appointment not found', 404, { code: 'NOT_FOUND' });
    }

    return toAppointmentResponse(appointment);
  }

  async selectAppointment(dto) {
    await this.#assertPatientExists(dto.patientId);

    const appointment = await this.appointmentRepository.selectAppointment({
      patientId: dto.patientId,
      doctorName: dto.doctorName,
      startsAt: dto.startsAt,
    });

    if (!appointment) {
      throw new AppError('Appointment not found', 404, { code: 'NOT_FOUND' });
    }

    return toAppointmentSelectResponse(appointment);
  }

  async bookAppointment(dto) {
    await this.#assertPatientExists(dto.patientId);
    await this.#assertCallSessionIfPresent(dto.callSessionId);

    const requestHash = this.#hashPayload({
      action: 'book',
      patientId: dto.patientId,
      slotId: dto.slotId,
      departmentId: dto.departmentId || null,
      visitReason: dto.visitReason || null,
      source: dto.source,
      callSessionId: dto.callSessionId || null,
    });

    const result = await this.appointmentRepository.bookAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapBookResult(result, requestHash);
  }

  async rescheduleAppointment(dto) {
    await this.#assertCallSessionIfPresent(dto.callSessionId);

    const requestHash = this.#hashPayload({
      action: 'reschedule',
      appointmentId: dto.appointmentId,
      newSlotId: dto.newSlotId,
      visitReason: dto.visitReason || null,
      callSessionId: dto.callSessionId || null,
    });

    const result = await this.appointmentRepository.rescheduleAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapRescheduleResult(result, requestHash);
  }

  async cancelAppointment(dto) {
    await this.#assertCallSessionIfPresent(dto.callSessionId);

    const requestHash = this.#hashPayload({
      action: 'cancel',
      appointmentId: dto.appointmentId,
      cancellationReason: dto.cancellationReason || null,
      callSessionId: dto.callSessionId || null,
    });

    const result = await this.appointmentRepository.cancelAtomic({
      ...dto,
      requestHash,
      idempotencyExpiresAt: this.#idempotencyExpiry(),
    });

    return await this.#mapCancelResult(result, requestHash);
  }

  async #assertPatientExists(patientId) {
    const patient = await this.patientRepository.findById(patientId);
    if (!patient) {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }
  }

  async #assertCallSessionIfPresent(callSessionId) {
    if (!callSessionId) {
      return;
    }

    const exists = await this.availabilityRepository.callSessionExists(callSessionId);
    if (!exists) {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }
  }

  async #mapBookResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayIdempotency(result.record, requestHash, 'appointment_book');
    }

    if (result.kind === 'idempotent_appointment') {
      return {
        appointment: toAppointmentBookResponse(result.appointment),
        replayed: true,
      };
    }

    if (result.kind === 'patient_not_found') {
      throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'department_not_found') {
      throw new AppError('Department not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'slot_not_found') {
      throw new AppError('Slot not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'slot_unavailable') {
      throw new AppError('Slot is not available to book', 409, {
        code: 'SLOT_UNAVAILABLE',
        details: result.slot
          ? { slotId: result.slot.id, status: result.slot.status }
          : undefined,
      });
    }

    if (result.kind !== 'created' || !result.appointment) {
      throw new AppError('Unable to book appointment', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      appointment: toAppointmentBookResponse(result.appointment),
      replayed: false,
    };
  }

  async #mapRescheduleResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayRescheduleIdempotency(result.record, requestHash);
    }

    if (result.kind === 'idempotent_appointment') {
      const previousId = result.appointment.rescheduledFromId;
      const previous = previousId
        ? await this.appointmentRepository.findById(previousId)
        : null;

      return {
        previousAppointment: toPreviousAppointmentSummary(previous),
        appointment: toAppointmentResponse(result.appointment),
        replayed: true,
      };
    }

    if (result.kind === 'not_found') {
      throw new AppError('Appointment not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'slot_not_found') {
      throw new AppError('Slot not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'same_slot') {
      throw new AppError('New slot must be different from the current slot', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    if (result.kind === 'conflict') {
      throw new AppError('Appointment cannot be rescheduled in its current state', 409, {
        code: 'CONFLICT',
        details: { status: result.appointment?.status },
      });
    }

    if (result.kind === 'policy_violation') {
      throw new AppError('Appointment is outside the reschedule policy window', 422, {
        code: 'POLICY_VIOLATION',
        details: { rescheduleWindowHours: result.windowHours },
      });
    }

    if (result.kind === 'slot_unavailable') {
      throw new AppError('Slot is not available to book', 409, {
        code: 'SLOT_UNAVAILABLE',
        details: result.slot
          ? { slotId: result.slot.id, status: result.slot.status }
          : undefined,
      });
    }

    if (result.kind !== 'rescheduled' || !result.appointment) {
      throw new AppError('Unable to reschedule appointment', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      previousAppointment: toPreviousAppointmentSummary(result.previousAppointment),
      appointment: toAppointmentResponse(result.appointment),
      replayed: false,
    };
  }

  async #mapCancelResult(result, requestHash) {
    if (result.kind === 'idempotent_hit') {
      return await this.#replayCancelIdempotency(result.record, requestHash);
    }

    if (result.kind === 'not_found') {
      throw new AppError('Appointment not found', 404, { code: 'NOT_FOUND' });
    }

    if (result.kind === 'already_cancelled') {
      return {
        appointment: toAppointmentCancelResponse(result.appointment),
        replayed: true,
      };
    }

    if (result.kind === 'conflict') {
      throw new AppError('Appointment cannot be cancelled in its current state', 409, {
        code: 'CONFLICT',
        details: { status: result.appointment?.status },
      });
    }

    if (result.kind === 'policy_violation') {
      throw new AppError('Appointment is outside the cancellation policy window', 422, {
        code: 'POLICY_VIOLATION',
        details: { cancellationWindowHours: result.windowHours },
      });
    }

    if (result.kind !== 'cancelled' || !result.appointment) {
      throw new AppError('Unable to cancel appointment', 500, {
        code: 'INTERNAL_ERROR',
        isOperational: false,
      });
    }

    return {
      appointment: toAppointmentCancelResponse(result.appointment),
      replayed: false,
    };
  }

  async #replayIdempotency(record, requestHash, expectedScope) {
    this.#assertIdempotencyMatch(record, requestHash, expectedScope);

    const appointmentId = record.resourceId || record.responseBody?.appointmentId;
    if (appointmentId) {
      const appointment = await this.appointmentRepository.findById(appointmentId);
      if (appointment) {
        return {
          appointment: toAppointmentBookResponse(appointment),
          replayed: true,
        };
      }
    }

    throw new AppError(
      'Idempotency key was already used with a different payload',
      409,
      { code: 'IDEMPOTENCY_CONFLICT' },
    );
  }

  async #replayRescheduleIdempotency(record, requestHash) {
    this.#assertIdempotencyMatch(record, requestHash, 'appointment_reschedule');

    const appointmentId = record.resourceId || record.responseBody?.appointmentId;
    const previousId = record.responseBody?.previousAppointmentId;

    const appointment = appointmentId
      ? await this.appointmentRepository.findById(appointmentId)
      : null;
    const previous = previousId
      ? await this.appointmentRepository.findById(previousId)
      : null;

    if (!appointment) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    return {
      previousAppointment: toPreviousAppointmentSummary(previous),
      appointment: toAppointmentResponse(appointment),
      replayed: true,
    };
  }

  async #replayCancelIdempotency(record, requestHash) {
    this.#assertIdempotencyMatch(record, requestHash, 'appointment_cancel');

    const appointmentId = record.resourceId || record.responseBody?.appointmentId;
    const appointment = appointmentId
      ? await this.appointmentRepository.findById(appointmentId)
      : null;

    if (!appointment) {
      throw new AppError(
        'Idempotency key was already used with a different payload',
        409,
        { code: 'IDEMPOTENCY_CONFLICT' },
      );
    }

    return {
      appointment: toAppointmentCancelResponse(appointment),
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

module.exports = AppointmentService;
