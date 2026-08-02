const { APPOINTMENT_SOURCES } = require('../dto/appointmentDto');

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value, field, errors, { maxLength, minLength } = {}) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  if (minLength && trimmed.length < minLength) {
    errors.push(`${field} must be at least ${minLength} characters`);
  }

  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function requireString(value, field, errors, { maxLength, minLength } = {}) {
  const raw = firstValue(value);

  if (!isNonEmptyString(raw)) {
    errors.push(`${field} is required`);
    return undefined;
  }

  const trimmed = raw.trim();

  if (minLength && trimmed.length < minLength) {
    errors.push(`${field} must be at least ${minLength} characters`);
  }

  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function requireBodyObject(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }
  return null;
}

function resolveIdempotencyKey(req, body, errors) {
  const fromHeader = optionalString(req.headers?.['idempotency-key'], 'Idempotency-Key', errors, {
    minLength: 8,
    maxLength: 128,
  });
  const fromBody = optionalString(body.idempotencyKey, 'idempotencyKey', errors, {
    minLength: 8,
    maxLength: 128,
  });

  if (fromHeader && fromBody && fromHeader !== fromBody) {
    errors.push('Idempotency-Key header and idempotencyKey body must match');
  }

  return fromHeader || fromBody;
}

/**
 * POST /appointments
 */
function validateBookAppointment(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const patientId = requireString(body.patientId, 'patientId', errors, { maxLength: 64 });
  const slotId = requireString(body.slotId, 'slotId', errors, { maxLength: 64 });
  const departmentId = optionalString(body.departmentId, 'departmentId', errors, { maxLength: 64 });
  const visitReason = optionalString(body.visitReason, 'visitReason', errors, { maxLength: 500 });
  const callSessionId = optionalString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const idempotencyKey = resolveIdempotencyKey(req, body, errors);

  let source = 'VOICE_AI';
  if (body.source !== undefined && body.source !== null && body.source !== '') {
    if (typeof body.source !== 'string' || !APPOINTMENT_SOURCES.includes(body.source)) {
      errors.push(`source must be one of: ${APPOINTMENT_SOURCES.join(', ')}`);
    } else {
      source = body.source;
    }
  }

  if (!idempotencyKey) {
    errors.push('idempotencyKey or Idempotency-Key header is required');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      patientId,
      slotId,
      departmentId,
      visitReason,
      source,
      callSessionId,
      idempotencyKey,
    },
  };
}

/**
 * GET /appointments/:appointmentId
 */
function validateGetAppointment(req) {
  const errors = [];
  const appointmentId = requireString(req.params.appointmentId, 'appointmentId', errors, {
    maxLength: 64,
  });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { appointmentId } };
}

/**
 * POST /appointments/:appointmentId/reschedule
 */
function validateRescheduleAppointment(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const appointmentId = requireString(req.params.appointmentId, 'appointmentId', errors, {
    maxLength: 64,
  });
  const newSlotId = requireString(body.newSlotId, 'newSlotId', errors, { maxLength: 64 });
  const visitReason = optionalString(body.visitReason, 'visitReason', errors, { maxLength: 500 });
  const callSessionId = optionalString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const idempotencyKey = resolveIdempotencyKey(req, body, errors);

  if (!idempotencyKey) {
    errors.push('idempotencyKey or Idempotency-Key header is required');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      appointmentId,
      newSlotId,
      visitReason,
      callSessionId,
      idempotencyKey,
    },
  };
}

/**
 * POST /appointments/:appointmentId/cancel
 */
function validateCancelAppointment(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const appointmentId = requireString(req.params.appointmentId, 'appointmentId', errors, {
    maxLength: 64,
  });
  const cancellationReason = optionalString(body.cancellationReason, 'cancellationReason', errors, {
    maxLength: 500,
  });
  const callSessionId = optionalString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const idempotencyKey = resolveIdempotencyKey(req, body, errors);

  if (!idempotencyKey) {
    errors.push('idempotencyKey or Idempotency-Key header is required');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      appointmentId,
      cancellationReason,
      callSessionId,
      idempotencyKey,
    },
  };
}

function requireIsoDateTime(value, field, errors) {
  const raw = firstValue(value);

  if (!isNonEmptyString(raw)) {
    errors.push(`${field} is required`);
    return undefined;
  }

  const date = new Date(raw.trim());
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid ISO datetime`);
    return undefined;
  }

  return date.toISOString();
}

/**
 * POST /appointments/select
 */
function validateSelectAppointment(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const patientId = requireString(body.patientId, 'patientId', errors, { maxLength: 64 });
  const doctorName = requireString(body.doctorName, 'doctorName', errors, { maxLength: 200 });
  const startsAt = requireIsoDateTime(body.startsAt, 'startsAt', errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      patientId,
      doctorName,
      startsAt,
    },
  };
}

module.exports = {
  validateBookAppointment,
  validateGetAppointment,
  validateRescheduleAppointment,
  validateCancelAppointment,
  validateSelectAppointment,
};
