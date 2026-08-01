const { GENDER_VALUES, APPOINTMENT_STATUS_VALUES } = require('../dto/patientDto');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value, field, errors, { maxLength, minLength } = {}) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }

  const trimmed = value.trim();
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

function requireString(value, field, errors, { maxLength, minLength = 1 } = {}) {
  if (!isNonEmptyString(value)) {
    errors.push(`${field} is required`);
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    errors.push(`${field} is required`);
  }
  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function parseDateOnly(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) {
    errors.push(`${field} must be a date in YYYY-MM-DD format`);
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    errors.push(`${field} must be a valid calendar date`);
    return undefined;
  }

  return value;
}

function parseIsoDate(value, field, errors) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    errors.push(`${field} must be an ISO-8601 date or datetime`);
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date`);
    return undefined;
  }

  return date.toISOString();
}

/**
 * POST /patients/lookup — JSON body.
 */
function validateLookupPatient(req) {
  const errors = [];
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const phone = optionalString(body.phone, 'phone', errors, { maxLength: 32 });
  const fullName = optionalString(body.fullName, 'fullName', errors, { maxLength: 200 });
  const dateOfBirth = parseDateOnly(body.dateOfBirth, 'dateOfBirth', errors);

  if (!phone && !fullName) {
    errors.push('At least one of phone or fullName is required');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { phone, fullName, dateOfBirth },
  };
}

/**
 * POST /patients
 */
function validateCreatePatient(req) {
  const errors = [];
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const firstName = requireString(body.firstName, 'firstName', errors, { maxLength: 100 });
  const lastName = requireString(body.lastName, 'lastName', errors, { maxLength: 100 });
  const fullName = requireString(body.fullName, 'fullName', errors, { maxLength: 200 });
  const phone = requireString(body.phone, 'phone', errors, { maxLength: 32 });
  const email = optionalString(body.email, 'email', errors, { maxLength: 255 });
  const dateOfBirth = parseDateOnly(body.dateOfBirth, 'dateOfBirth', errors);
  const preferredLanguage = optionalString(body.preferredLanguage, 'preferredLanguage', errors, {
    maxLength: 16,
  });
  const idempotencyKey = optionalString(body.idempotencyKey, 'idempotencyKey', errors, {
    minLength: 8,
    maxLength: 128,
  });
  const notes = optionalString(body.notes, 'notes', errors, { maxLength: 2000 });

  let gender = 'UNKNOWN';
  if (body.gender !== undefined && body.gender !== null && body.gender !== '') {
    if (typeof body.gender !== 'string' || !GENDER_VALUES.includes(body.gender)) {
      errors.push(`gender must be one of: ${GENDER_VALUES.join(', ')}`);
    } else {
      gender = body.gender;
    }
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('email must be a valid email address');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      firstName,
      lastName,
      fullName,
      phone,
      email,
      dateOfBirth,
      gender,
      preferredLanguage: preferredLanguage || 'en',
      idempotencyKey,
      notes,
    },
  };
}

/**
 * GET /patients/:patientId
 */
function validateGetPatient(req) {
  const errors = [];
  const patientId = requireString(req.params.patientId, 'patientId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { patientId } };
}

/**
 * GET /patients/:patientId/appointments
 */
function validateListPatientAppointments(req) {
  const errors = [];
  const patientId = requireString(req.params.patientId, 'patientId', errors, { maxLength: 64 });
  const query = req.query || {};

  let status;
  if (query.status !== undefined && query.status !== null && query.status !== '') {
    if (
      typeof query.status !== 'string' ||
      !APPOINTMENT_STATUS_VALUES.includes(query.status)
    ) {
      errors.push(`status must be one of: ${APPOINTMENT_STATUS_VALUES.join(', ')}`);
    } else {
      status = query.status;
    }
  }

  const from = parseIsoDate(query.from, 'from', errors);
  const to = parseIsoDate(query.to, 'to', errors);

  let limit = 20;
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const parsed = Number.parseInt(query.limit, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      errors.push('limit must be an integer between 1 and 100');
    } else {
      limit = parsed;
    }
  }

  if (from && to && new Date(from) > new Date(to)) {
    errors.push('from must be before or equal to to');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { patientId, status, from, to, limit },
  };
}

module.exports = {
  validateLookupPatient,
  validateCreatePatient,
  validateGetPatient,
  validateListPatientAppointments,
};
