const crypto = require('crypto');
const { ERROR_CODES } = require('../../dto/clinikoDto');
const { ClinikoApiError } = require('./clinikoClient');

function toIso(value) {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value) {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Maps internal domain entities ↔ Cliniko API payloads.
 * Never exposes internal cuid IDs in outbound Cliniko bodies.
 */
class ClinikoMapper {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.defaultAppointmentTypeId = options.defaultAppointmentTypeId || null;
  }

  toClinikoPatient(patient) {
    if (!patient) {
      throw new ClinikoApiError('Patient is required for Cliniko mapping', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }

    const payload = {
      first_name: patient.firstName,
      last_name: patient.lastName,
      email: patient.email || undefined,
      date_of_birth: toDateOnly(patient.dateOfBirth) || undefined,
      notes: patient.notes || undefined,
    };

    if (patient.phoneE164 || patient.phone) {
      payload.patient_phone_numbers = [
        {
          number: patient.phoneE164 || patient.phone,
          phone_type: 'Mobile',
        },
      ];
    }

    return payload;
  }

  /**
   * @param {object} appointment Local appointment + related cliniko ids
   * @param {object} refs { patientClinikoId, practitionerClinikoId, businessClinikoId, appointmentTypeId }
   */
  toClinikoAppointmentCreate(appointment, refs) {
    this.#assertAppointmentRefs(refs);

    const payload = {
      patient_id: String(refs.patientClinikoId),
      practitioner_id: String(refs.practitionerClinikoId),
      business_id: String(refs.businessClinikoId),
      appointment_type_id: String(refs.appointmentTypeId),
      starts_at: toIso(appointment.startsAt),
      ends_at: toIso(appointment.endsAt),
      notes: this.#appointmentNotes(appointment),
    };

    return payload;
  }

  toClinikoAppointmentUpdate(appointment, refs) {
    this.#assertAppointmentRefs(refs, { requireType: false });

    const payload = {
      starts_at: toIso(appointment.startsAt),
      ends_at: toIso(appointment.endsAt),
      notes: this.#appointmentNotes(appointment),
    };

    if (refs.patientClinikoId) {
      payload.patient_id = String(refs.patientClinikoId);
    }
    if (refs.practitionerClinikoId) {
      payload.practitioner_id = String(refs.practitionerClinikoId);
    }
    if (refs.businessClinikoId) {
      payload.business_id = String(refs.businessClinikoId);
    }
    if (refs.appointmentTypeId) {
      payload.appointment_type_id = String(refs.appointmentTypeId);
    }

    return payload;
  }

  toClinikoCancellation(appointment) {
    return {
      cancelled_at: toIso(appointment.cancelledAt) || new Date().toISOString(),
      cancellation_note: appointment.cancellationReason || 'Cancelled via voice receptionist',
    };
  }

  /**
   * Determine outbound operation for an appointment sync row.
   * @returns {'create'|'update'|'cancel'}
   */
  resolveAppointmentOperation(appointment, syncRecord) {
    if (!appointment) {
      throw new ClinikoApiError('Local appointment not found for sync', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }

    if (appointment.status === 'CANCELLED') {
      return 'cancel';
    }

    const remoteId = syncRecord?.clinikoId || appointment.clinikoId;
    return remoteId ? 'update' : 'create';
  }

  extractClinikoId(response) {
    if (!response || typeof response !== 'object') {
      return null;
    }
    if (response.id != null) {
      return String(response.id);
    }
    if (response.dryRun && response.id) {
      return String(response.id);
    }
    return null;
  }

  toSyncListItem(record) {
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      entityType: record.entityType,
      localId: record.localId,
      clinikoId: record.clinikoId ?? null,
      direction: record.direction,
      status: record.status,
      attemptCount: record.attemptCount ?? 0,
      lastError: record.errorMessage ?? null,
      syncedAt: toIso(record.lastSyncedAt),
      lastAttemptAt: toIso(record.lastAttemptAt),
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    };
  }

  toSyncDetail(record) {
    if (!record) {
      return null;
    }

    return {
      ...this.toSyncListItem(record),
      payloadHash: record.payloadHash ?? null,
      requestPayload: asObject(record.requestPayload),
      responsePayload: record.responsePayload ?? null,
      metadata: asObject(record.metadata),
    };
  }

  #appointmentNotes(appointment) {
    const parts = [];
    if (appointment.visitReason) {
      parts.push(`Visit reason: ${appointment.visitReason}`);
    }
    if (appointment.notes) {
      parts.push(appointment.notes);
    }
    parts.push('Source: Clinic Voice AI');
    return parts.join('\n');
  }

  #assertAppointmentRefs(refs, { requireType = true } = {}) {
    if (!refs?.patientClinikoId) {
      throw new ClinikoApiError('Patient is not linked to Cliniko (missing clinikoId)', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }
    if (!refs?.practitionerClinikoId) {
      throw new ClinikoApiError('Doctor is not linked to Cliniko (missing clinikoId)', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }
    if (!refs?.businessClinikoId) {
      throw new ClinikoApiError('Branch is not linked to Cliniko (missing clinikoId)', {
        code: ERROR_CODES.VALIDATION_ERROR,
        retryable: false,
      });
    }
    if (requireType && !refs?.appointmentTypeId) {
      throw new ClinikoApiError(
        'CLINIKO_DEFAULT_APPOINTMENT_TYPE_ID is required to create Cliniko appointments',
        {
          code: ERROR_CODES.VALIDATION_ERROR,
          retryable: false,
        },
      );
    }
  }
}

module.exports = {
  ClinikoMapper,
  hashPayload,
  toIso,
  toDateOnly,
  asObject,
};
