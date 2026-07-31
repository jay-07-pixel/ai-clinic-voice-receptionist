const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../middleware/errorHandler');
const ClinikoSyncRepository = require('../../repositories/clinikoSyncRepository');
const { ClinikoClient, ClinikoApiError } = require('./clinikoClient');
const { ClinikoMapper, hashPayload } = require('./clinikoMapper');
const {
  ERROR_CODES,
  PERMANENT_ERROR_CODES,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
} = require('../../dto/clinikoDto');

class ClinikoSyncService {
  /**
   * @param {object} [deps]
   */
  constructor({
    repository = new ClinikoSyncRepository(),
    client = new ClinikoClient({
      apiKey: config.cliniko?.apiKey,
      baseUrl: config.cliniko?.baseUrl,
      timeoutMs: config.cliniko?.timeoutMs,
      userAgent: config.cliniko?.userAgent,
      dryRun: config.cliniko?.dryRun,
      maxRetries: config.cliniko?.maxRetries,
      baseBackoffMs: config.cliniko?.baseBackoffMs,
    }),
    mapper = new ClinikoMapper({
      defaultAppointmentTypeId: config.cliniko?.defaultAppointmentTypeId,
    }),
    maxAttempts = config.cliniko?.maxAttempts || DEFAULT_MAX_ATTEMPTS,
    batchSize = config.cliniko?.batchSize || DEFAULT_BATCH_SIZE,
  } = {}) {
    this.repository = repository;
    this.client = client;
    this.mapper = mapper;
    this.maxAttempts = maxAttempts;
    this.batchSize = batchSize;
  }

  async enqueueSync(dto) {
    if (dto.entityType === 'APPOINTMENT') {
      const appointment = await this.repository.findAppointmentForSync(dto.localId);
      if (!appointment) {
        throw new AppError('Appointment not found', 404, { code: 'NOT_FOUND' });
      }
    }

    if (dto.entityType === 'PATIENT') {
      const patient = await this.repository.findPatientForSync(dto.localId);
      if (!patient) {
        throw new AppError('Patient not found', 404, { code: 'NOT_FOUND' });
      }
    }

    const result = await this.repository.enqueue({
      entityType: dto.entityType,
      localId: dto.localId,
      direction: dto.direction || 'OUTBOUND',
      force: dto.force === true,
      metadata: dto.metadata,
    });

    if (result.kind === 'in_progress') {
      throw new AppError('Sync already in progress for this entity', 409, {
        code: 'CONFLICT',
        details: { syncId: result.record.id },
      });
    }

    return {
      clinikoSync: this.mapper.toSyncListItem(result.record),
      enqueued: result.kind === 'enqueued',
      alreadySuccess: result.kind === 'already_success',
    };
  }

  async listSyncJobs(filters) {
    const { records, total } = await this.repository.list(filters);
    const items = records.map((row) => this.mapper.toSyncListItem(row)).filter(Boolean);

    return {
      clinikoSyncs: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        count: items.length,
        hasMore: filters.offset + items.length < total,
      },
    };
  }

  async getSyncJob(id) {
    const record = await this.repository.findById(id);
    if (!record) {
      throw new AppError('Cliniko sync record not found', 404, { code: 'NOT_FOUND' });
    }
    return this.mapper.toSyncDetail(record);
  }

  /**
   * Process a batch of PENDING sync jobs. Safe for concurrent callers.
   */
  async processPending({ limit } = {}) {
    const batchLimit = limit || this.batchSize;
    const claimed = await this.repository.claimDueBatch(batchLimit);

    logger.info('Cliniko sync batch claimed', { claimed: claimed.length, limit: batchLimit });

    const results = [];
    for (const record of claimed) {
      // Sequential processing — safer for rate limits and ordering.
      // eslint-disable-next-line no-await-in-loop
      const outcome = await this.processClaimedRecord(record);
      results.push(outcome);
    }

    return {
      claimed: claimed.length,
      processed: results.length,
      succeeded: results.filter((r) => r.status === 'SUCCESS').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      requeued: results.filter((r) => r.status === 'PENDING').length,
      results,
    };
  }

  async processClaimedRecord(record) {
    let requestPayload = null;

    try {
      const outcome = await this.#dispatchEntity(record);
      requestPayload = outcome.requestPayload;

      const updated = await this.repository.markSuccess(record.id, {
        clinikoId: outcome.clinikoId,
        requestPayload: outcome.requestPayload,
        responsePayload: outcome.responsePayload,
        payloadHash: outcome.payloadHash,
        metadata: {
          operation: outcome.operation,
          entityType: record.entityType,
        },
      });

      await this.repository.createAuditLog({
        action: 'SYNC',
        entityType: 'ClinikoSync',
        entityId: record.id,
        after: updated,
        metadata: {
          localId: record.localId,
          entityType: record.entityType,
          operation: outcome.operation,
          clinikoId: outcome.clinikoId,
        },
      });

      return {
        id: record.id,
        status: 'SUCCESS',
        operation: outcome.operation,
        clinikoId: outcome.clinikoId,
      };
    } catch (error) {
      const normalized = this.#normalizeError(error);
      const updated = await this.repository.markFailure(record.id, {
        errorMessage: `${normalized.code}: ${normalized.message}`,
        errorCode: normalized.code,
        retryable: normalized.retryable,
        attemptCount: record.attemptCount,
        maxAttempts: this.maxAttempts,
        requestPayload,
        responsePayload: normalized.details,
        metadata: {
          entityType: record.entityType,
          localId: record.localId,
        },
      });

      logger.error('Cliniko sync failed', {
        syncId: record.id,
        entityType: record.entityType,
        localId: record.localId,
        code: normalized.code,
        retryable: normalized.retryable,
        attemptCount: record.attemptCount,
        status: updated.status,
      });

      return {
        id: record.id,
        status: updated.status,
        error: {
          code: normalized.code,
          message: normalized.message,
          retryable: normalized.retryable,
        },
      };
    }
  }

  async #dispatchEntity(record) {
    switch (record.entityType) {
      case 'APPOINTMENT':
        return this.#syncAppointment(record);
      case 'PATIENT':
        return this.#syncPatient(record);
      default:
        throw new ClinikoApiError(
          `Unsupported Cliniko sync entityType: ${record.entityType}`,
          {
            code: ERROR_CODES.VALIDATION_ERROR,
            retryable: false,
          },
        );
    }
  }

  async #syncPatient(record) {
    const patient = await this.repository.findPatientForSync(record.localId);
    if (!patient) {
      throw new ClinikoApiError('Local patient not found', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }

    const payload = this.mapper.toClinikoPatient(patient);
    const payloadHash = hashPayload(payload);

    if (patient.clinikoId || record.clinikoId) {
      const clinikoId = patient.clinikoId || record.clinikoId;
      const response = await this.client.updatePatient(clinikoId, payload);
      return {
        operation: 'update',
        clinikoId: String(clinikoId),
        requestPayload: payload,
        responsePayload: response,
        payloadHash,
      };
    }

    const response = await this.client.createPatient(payload);
    const clinikoId = this.mapper.extractClinikoId(response);
    if (!clinikoId) {
      throw new ClinikoApiError('Cliniko patient create returned no id', {
        code: ERROR_CODES.SERVER_ERROR,
        retryable: true,
        details: response,
      });
    }

    await this.repository.setPatientClinikoId(patient.id, clinikoId);

    return {
      operation: 'create',
      clinikoId,
      requestPayload: payload,
      responsePayload: response,
      payloadHash,
    };
  }

  async #syncAppointment(record) {
    const appointment = await this.repository.findAppointmentForSync(record.localId);
    if (!appointment) {
      throw new ClinikoApiError('Local appointment not found', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }

    const patientClinikoId = await this.#ensurePatientClinikoId(appointment.patient);
    const refs = {
      patientClinikoId,
      practitionerClinikoId: appointment.doctor?.clinikoId || null,
      businessClinikoId: appointment.branch?.clinikoId || null,
      appointmentTypeId:
        this.mapper.defaultAppointmentTypeId ||
        appointment.metadata?.clinikoAppointmentTypeId ||
        null,
    };

    const operation = this.mapper.resolveAppointmentOperation(appointment, record);

    if (operation === 'cancel') {
      const remoteId = record.clinikoId || appointment.clinikoId;
      if (!remoteId) {
        // Nothing remote to cancel — treat as success no-op.
        return {
          operation: 'cancel_noop',
          clinikoId: null,
          requestPayload: null,
          responsePayload: { skipped: true, reason: 'no_remote_appointment' },
          payloadHash: null,
        };
      }

      const payload = this.mapper.toClinikoCancellation(appointment);
      const response = await this.client.cancelIndividualAppointment(remoteId, payload);
      return {
        operation: 'cancel',
        clinikoId: String(remoteId),
        requestPayload: payload,
        responsePayload: response,
        payloadHash: hashPayload(payload),
      };
    }

    if (operation === 'update') {
      const remoteId = record.clinikoId || appointment.clinikoId;
      const payload = this.mapper.toClinikoAppointmentUpdate(appointment, refs);
      const response = await this.client.updateIndividualAppointment(remoteId, payload);
      return {
        operation: 'update',
        clinikoId: String(remoteId),
        requestPayload: payload,
        responsePayload: response,
        payloadHash: hashPayload(payload),
      };
    }

    // create
    const payload = this.mapper.toClinikoAppointmentCreate(appointment, refs);
    const response = await this.client.createIndividualAppointment(payload);
    const clinikoId = this.mapper.extractClinikoId(response);

    if (!clinikoId) {
      throw new ClinikoApiError('Cliniko appointment create returned no id', {
        code: ERROR_CODES.SERVER_ERROR,
        retryable: true,
        details: response,
      });
    }

    await this.repository.setAppointmentClinikoId(appointment.id, clinikoId);

    return {
      operation: 'create',
      clinikoId,
      requestPayload: payload,
      responsePayload: response,
      payloadHash: hashPayload(payload),
    };
  }

  async #ensurePatientClinikoId(patient) {
    if (!patient) {
      throw new ClinikoApiError('Appointment patient is missing', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }

    if (patient.clinikoId) {
      return String(patient.clinikoId);
    }

    const payload = this.mapper.toClinikoPatient(patient);
    const response = await this.client.createPatient(payload);
    const clinikoId = this.mapper.extractClinikoId(response);

    if (!clinikoId) {
      throw new ClinikoApiError('Cliniko patient create returned no id', {
        code: ERROR_CODES.SERVER_ERROR,
        retryable: true,
        details: response,
      });
    }

    await this.repository.setPatientClinikoId(patient.id, clinikoId);
    return clinikoId;
  }

  #normalizeError(error) {
    if (error instanceof ClinikoApiError) {
      return {
        code: error.code || ERROR_CODES.UNKNOWN_ERROR,
        message: error.message,
        retryable:
          error.retryable === true && !PERMANENT_ERROR_CODES.includes(error.code),
        details: error.details || null,
      };
    }

    if (error instanceof AppError) {
      const code =
        error.code === 'NOT_FOUND'
          ? ERROR_CODES.VALIDATION_ERROR
          : ERROR_CODES.UNKNOWN_ERROR;
      return {
        code,
        message: error.message,
        retryable: false,
        details: error.details || null,
      };
    }

    return {
      code: ERROR_CODES.UNKNOWN_ERROR,
      message: error?.message || 'Unknown Cliniko sync error',
      retryable: true,
      details: null,
    };
  }
}

module.exports = ClinikoSyncService;
