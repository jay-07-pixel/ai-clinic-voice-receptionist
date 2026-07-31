const PatientService = require('../../services/patientService');
const DoctorService = require('../../services/doctorService');
const AvailabilityService = require('../../services/availabilityService');
const AppointmentService = require('../../services/appointmentService');
const BranchService = require('../../services/branchService');
const CallSessionService = require('../../services/callSessionService');
const CallbackService = require('../../services/callbackService');
const RetellSessionSyncService = require('./retellSessionSyncService');
const { AppError } = require('../../middleware/errorHandler');
const { normalizeToE164 } = require('../../utils/phone');
const { toToolError, toToolSuccess, asObject } = require('./retellMapper');
const {
  LIST_DEFAULT_LIMIT,
  LIST_DEFAULT_OFFSET,
} = require('../../dto/branchDto');

/**
 * Dispatches Retell tool calls to existing domain services.
 * Never touches Prisma and never reimplements domain rules.
 */
class RetellToolDispatcher {
  /**
   * @param {object} [deps]
   */
  constructor({
    patientService = new PatientService(),
    doctorService = new DoctorService(),
    availabilityService = new AvailabilityService(),
    appointmentService = new AppointmentService(),
    branchService = new BranchService(),
    callSessionService = new CallSessionService(),
    callbackService = new CallbackService(),
    sessionSyncService = new RetellSessionSyncService(),
  } = {}) {
    this.patientService = patientService;
    this.doctorService = doctorService;
    this.availabilityService = availabilityService;
    this.appointmentService = appointmentService;
    this.branchService = branchService;
    this.callSessionService = callSessionService;
    this.callbackService = callbackService;
    this.sessionSyncService = sessionSyncService;

    this.handlers = Object.freeze({
      searchAvailability: (args) => this.#searchAvailability(args),
      search_availability: (args) => this.#searchAvailability(args),
      earliestAvailability: (args) => this.#earliestAvailability(args),
      earliest_availability: (args) => this.#earliestAvailability(args),
      bookAppointment: (args) => this.#bookAppointment(args),
      book_appointment: (args) => this.#bookAppointment(args),
      cancelAppointment: (args) => this.#cancelAppointment(args),
      cancel_appointment: (args) => this.#cancelAppointment(args),
      rescheduleAppointment: (args) => this.#rescheduleAppointment(args),
      reschedule_appointment: (args) => this.#rescheduleAppointment(args),
      findPatient: (args) => this.#findPatient(args),
      find_patient: (args) => this.#findPatient(args),
      registerPatient: (args) => this.#registerPatient(args),
      register_patient: (args) => this.#registerPatient(args),
      holdSlot: (args) => this.#holdSlot(args),
      hold_slot: (args) => this.#holdSlot(args),
      releaseSlot: (args) => this.#releaseSlot(args),
      release_slot: (args) => this.#releaseSlot(args),
      resumeCall: (args) => this.#resumeCall(args),
      resume_call: (args) => this.#resumeCall(args),
      saveConversation: (args) => this.#saveConversation(args),
      save_conversation: (args) => this.#saveConversation(args),
      createCallback: (args) => this.#createCallback(args),
      create_callback: (args) => this.#createCallback(args),
      listPatientAppointments: (args) => this.#listPatientAppointments(args),
      list_patient_appointments: (args) => this.#listPatientAppointments(args),
      getDoctor: (args) => this.#getDoctor(args),
      get_doctor: (args) => this.#getDoctor(args),
      listDoctors: (args) => this.#listDoctors(args),
      list_doctors: (args) => this.#listDoctors(args),
      getBranch: (args) => this.#getBranch(args),
      get_branch: (args) => this.#getBranch(args),
      listBranches: (args) => this.#listBranches(args),
      list_branches: (args) => this.#listBranches(args),
      getBranchHours: (args) => this.#getBranchHours(args),
      get_branch_hours: (args) => this.#getBranchHours(args),
    });
  }

  /**
   * @param {string} toolName
   * @param {object} args
   * @param {object} [context]
   */
  async dispatch(toolName, args = {}, context = {}) {
    const name = String(toolName || '').trim();
    const handler = this.handlers[name];

    if (!handler) {
      return toToolError(
        new AppError(`Unknown Retell tool: ${name}`, 400, { code: 'VALIDATION_ERROR' }),
      );
    }

    const normalizedArgs = {
      ...this.#normalizeArgs(args),
      callSessionId:
        args.callSessionId ||
        args.call_session_id ||
        context.callSessionId ||
        undefined,
      externalCallId:
        args.externalCallId ||
        args.external_call_id ||
        context.externalCallId ||
        undefined,
    };

    try {
      const data = await handler(normalizedArgs);
      return toToolSuccess(data);
    } catch (error) {
      return toToolError(error);
    }
  }

  #normalizeArgs(args) {
    const source = asObject(args);
    const out = {};

    for (const [key, value] of Object.entries(source)) {
      const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      out[camel] = value;
      out[key] = value;
    }

    return out;
  }

  #require(value, field) {
    if (value === undefined || value === null || value === '') {
      throw new AppError(`${field} is required`, 400, { code: 'VALIDATION_ERROR' });
    }
    return value;
  }

  #parseDate(value, field) {
    if (value == null || value === '') {
      return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new AppError(`${field} must be a valid datetime`, 400, {
        code: 'VALIDATION_ERROR',
      });
    }
    return date;
  }

  async #searchAvailability(args) {
    const from = this.#parseDate(args.from, 'from');
    const to = this.#parseDate(args.to, 'to');
    this.#require(from, 'from');
    this.#require(to, 'to');

    if (args.earliestOnly === true || args.earliest_only === true) {
      return this.#earliestAvailability(args);
    }

    const result = await this.availabilityService.searchAvailability({
      branchId: args.branchId || (Array.isArray(args.branchIds) ? args.branchIds[0] : undefined),
      doctorId: args.doctorId,
      departmentId: args.departmentId,
      from,
      to,
      limit: args.limit || 5,
      offset: args.offset || 0,
    });

    return { slots: result.slots, pagination: result.pagination };
  }

  async #earliestAvailability(args) {
    const from = this.#parseDate(args.from, 'from');
    const to = this.#parseDate(args.to, 'to');
    this.#require(from, 'from');
    this.#require(to, 'to');

    const result = await this.availabilityService.findEarliest({
      branchId: args.branchId,
      branchIds: args.branchIds,
      doctorId: args.doctorId,
      departmentId: args.departmentId,
      from,
      to,
    });

    return result;
  }

  async #bookAppointment(args) {
    const result = await this.appointmentService.bookAppointment({
      patientId: this.#require(args.patientId, 'patientId'),
      slotId: this.#require(args.slotId, 'slotId'),
      departmentId: args.departmentId,
      visitReason: args.visitReason,
      callSessionId: args.callSessionId,
      source: 'VOICE_AI',
      idempotencyKey: this.#require(
        args.idempotencyKey ||
          this.sessionSyncService.createIdempotencyKey('book', [
            args.callSessionId,
            args.slotId,
          ]),
        'idempotencyKey',
      ),
    });

    return { appointment: result.appointment };
  }

  async #cancelAppointment(args) {
    const result = await this.appointmentService.cancelAppointment({
      appointmentId: this.#require(args.appointmentId, 'appointmentId'),
      patientId: args.patientId,
      cancellationReason: args.cancellationReason || args.reason,
      callSessionId: args.callSessionId,
      idempotencyKey: this.#require(
        args.idempotencyKey ||
          this.sessionSyncService.createIdempotencyKey('cancel', [
            args.callSessionId,
            args.appointmentId,
          ]),
        'idempotencyKey',
      ),
    });

    return {
      appointmentId: result.appointment?.id || args.appointmentId,
      status: result.appointment?.status || 'CANCELLED',
      message: 'Appointment cancelled',
      appointment: result.appointment,
    };
  }

  async #rescheduleAppointment(args) {
    const result = await this.appointmentService.rescheduleAppointment({
      appointmentId: this.#require(args.appointmentId, 'appointmentId'),
      newSlotId: this.#require(args.newSlotId, 'newSlotId'),
      visitReason: args.visitReason,
      callSessionId: args.callSessionId,
      idempotencyKey: this.#require(
        args.idempotencyKey ||
          this.sessionSyncService.createIdempotencyKey('reschedule', [
            args.callSessionId,
            args.appointmentId,
            args.newSlotId,
          ]),
        'idempotencyKey',
      ),
    });

    return { appointment: result.appointment, previous: result.previous };
  }

  async #findPatient(args) {
    const result = await this.patientService.lookupPatient({
      phone: args.phone,
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
    });

    return {
      found: result.found,
      patient: result.patient
        ? {
            patientId: result.patient.id,
            fullName: result.patient.fullName,
            isReturning: result.patient.isReturning,
            preferredLanguage: result.patient.preferredLanguage,
          }
        : null,
      matchConfidence: result.matchConfidence,
    };
  }

  async #registerPatient(args) {
    const result = await this.patientService.createPatient({
      firstName: this.#require(args.firstName, 'firstName'),
      lastName: this.#require(args.lastName, 'lastName'),
      fullName: args.fullName || `${args.firstName} ${args.lastName}`.trim(),
      phone: this.#require(args.phone, 'phone'),
      dateOfBirth: args.dateOfBirth,
      gender: args.gender || 'UNKNOWN',
      preferredLanguage: args.preferredLanguage,
      idempotencyKey: this.#require(
        args.idempotencyKey ||
          this.sessionSyncService.createIdempotencyKey('patient', [
            args.callSessionId,
            normalizeToE164(args.phone) || args.phone,
          ]),
        'idempotencyKey',
      ),
    });

    return {
      patientId: result.patient.id,
      fullName: result.patient.fullName,
      patient: result.patient,
    };
  }

  async #holdSlot(args) {
    const result = await this.availabilityService.holdSlot({
      slotId: this.#require(args.slotId, 'slotId'),
      callSessionId: this.#require(args.callSessionId, 'callSessionId'),
      idempotencyKey:
        args.idempotencyKey ||
        this.sessionSyncService.createIdempotencyKey('hold', [
          args.callSessionId,
          args.slotId,
        ]),
    });

    return {
      slotId: result.slotId || args.slotId,
      holdExpiresAt: result.holdExpiresAt,
      ...result,
    };
  }

  async #releaseSlot(args) {
    const result = await this.availabilityService.releaseSlot({
      slotId: this.#require(args.slotId, 'slotId'),
      callSessionId: args.callSessionId,
      idempotencyKey:
        args.idempotencyKey ||
        this.sessionSyncService.createIdempotencyKey('release', [
          args.callSessionId,
          args.slotId,
        ]),
    });

    return {
      slotId: result.slotId || args.slotId,
      status: result.status || 'AVAILABLE',
      ...result,
    };
  }

  async #resumeCall(args) {
    let sessionId = args.callSessionId || args.sessionId;

    if (!sessionId && args.recoveryToken) {
      // Resume requires sessionId in CallSessionService; recovery is validated there.
      // Callers should pass sessionId when known; otherwise soft-miss.
      throw new AppError(
        'resumeCall requires callSessionId together with recoveryToken',
        400,
        { code: 'VALIDATION_ERROR' },
      );
    }

    this.#require(sessionId, 'callSessionId');

    const result = await this.callSessionService.resumeSession({
      sessionId,
      externalCallId: args.externalCallId,
      recoveryToken: args.recoveryToken,
      reason: args.reason || 'DROPPED_CALL',
      metadata: asObject(args.metadata),
      idempotencyKey:
        args.idempotencyKey ||
        this.sessionSyncService.createIdempotencyKey('resume', [
          sessionId,
          args.externalCallId,
        ]),
    });

    const session = result.callSession;
    return {
      recovered: true,
      callSessionId: session.id,
      currentIntent: session.currentIntent,
      currentStep: session.currentStep,
      conversationState: session.currentState || {},
      patientId: session.patientId,
      promptVersion: session.promptVersion,
      modelVersion: session.modelVersion,
      callSession: session,
    };
  }

  async #saveConversation(args) {
    const saved = await this.sessionSyncService.saveConversation(args);
    return saved;
  }

  async #createCallback(args) {
    const phone = this.#require(args.phone, 'phone');
    const result = await this.callbackService.createCallback({
      phone,
      phoneE164: normalizeToE164(phone),
      patientId: args.patientId,
      branchId: args.branchId,
      callSessionId: args.callSessionId,
      reason: args.reason || 'DROPPED_CALL',
      source: args.source || 'missed_call',
      priority: args.priority ?? 10,
      maxAttempts: args.maxAttempts ?? 3,
      preferredTime: args.preferredTime ? this.#parseDate(args.preferredTime, 'preferredTime') : null,
      notes: args.notes,
      metadata: {
        source: args.source || 'missed_call',
        ...asObject(args.metadata),
      },
      idempotencyKey:
        args.idempotencyKey ||
        this.sessionSyncService.createIdempotencyKey('callback', [
          args.callSessionId,
          phone,
        ]),
    });

    return {
      callbackId: result.callback.id,
      status: result.callback.status,
      callbackRequest: result.callback,
    };
  }

  async #listPatientAppointments(args) {
    const patientId = this.#require(args.patientId, 'patientId');
    const result = await this.patientService.listPatientAppointments(patientId, {
      status: args.status,
      limit: args.limit || LIST_DEFAULT_LIMIT,
      offset: args.offset || LIST_DEFAULT_OFFSET,
    });

    return result;
  }

  async #getDoctor(args) {
    const doctor = await this.doctorService.getDoctorById(
      this.#require(args.doctorId, 'doctorId'),
    );
    return { doctor };
  }

  async #listDoctors(args) {
    return this.doctorService.listDoctors({
      branchId: args.branchId,
      departmentId: args.departmentId,
      q: args.q,
      limit: args.limit || LIST_DEFAULT_LIMIT,
      offset: args.offset || LIST_DEFAULT_OFFSET,
    });
  }

  async #getBranch(args) {
    const branch = await this.branchService.getBranchById(
      this.#require(args.branchId, 'branchId'),
    );
    return { branch };
  }

  async #listBranches(args) {
    return this.branchService.listBranches({
      isActive: args.isActive,
      q: args.q,
      limit: args.limit || LIST_DEFAULT_LIMIT,
      offset: args.offset || LIST_DEFAULT_OFFSET,
    });
  }

  async #getBranchHours(args) {
    const hours = await this.branchService.getBranchHours(
      this.#require(args.branchId, 'branchId'),
    );
    return hours;
  }
}

module.exports = RetellToolDispatcher;
