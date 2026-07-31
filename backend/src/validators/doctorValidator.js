const {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
  SCHEDULE_MAX_RANGE_DAYS,
} = require('../dto/doctorDto');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
const DIGITS_RE = /^\d+$/;

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value, field, errors, { maxLength } = {}) {
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

  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function requireString(value, field, errors, { maxLength } = {}) {
  const raw = firstValue(value);

  if (!isNonEmptyString(raw)) {
    errors.push(`${field} is required`);
    return undefined;
  }

  const trimmed = raw.trim();
  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function parseDateOnly(value, field, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw !== 'string' || !DATE_ONLY_RE.test(raw)) {
    errors.push(`${field} must be a date in YYYY-MM-DD format`);
    return undefined;
  }

  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    errors.push(`${field} must be a valid calendar date`);
    return undefined;
  }

  return raw;
}

function parseIsoOrDateOnly(value, field, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }

  if (DATE_ONLY_RE.test(raw)) {
    return parseDateOnly(raw, field, errors);
  }

  if (!ISO_DATE_RE.test(raw)) {
    errors.push(`${field} must be YYYY-MM-DD or an ISO-8601 datetime`);
    return undefined;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date`);
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function parseNonNegativeInt(value, field, errors, { defaultValue, max } = {}) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }

  const asString = String(raw).trim();
  if (!DIGITS_RE.test(asString)) {
    errors.push(`${field} must be an integer between 0 and ${max}`);
    return defaultValue;
  }

  const parsed = Number.parseInt(asString, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    errors.push(`${field} must be an integer between 0 and ${max}`);
    return defaultValue;
  }

  return parsed;
}

function parseLimit(value, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return LIST_DEFAULT_LIMIT;
  }

  const asString = String(raw).trim();
  if (!DIGITS_RE.test(asString)) {
    errors.push(`limit must be an integer between 1 and ${LIST_MAX_LIMIT}`);
    return LIST_DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(asString, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > LIST_MAX_LIMIT) {
    errors.push(`limit must be an integer between 1 and ${LIST_MAX_LIMIT}`);
    return LIST_DEFAULT_LIMIT;
  }

  return parsed;
}

function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

/**
 * GET /doctors
 */
function validateListDoctors(req) {
  const errors = [];
  const query = req.query || {};

  const branchId = optionalString(query.branchId, 'branchId', errors, { maxLength: 64 });
  const departmentId = optionalString(query.departmentId, 'departmentId', errors, {
    maxLength: 64,
  });
  const q = optionalString(query.q, 'q', errors, { maxLength: 100 });
  const limit = parseLimit(query.limit, errors);
  const offset = parseNonNegativeInt(query.offset, 'offset', errors, {
    defaultValue: LIST_DEFAULT_OFFSET,
    max: 100000,
  });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { branchId, departmentId, q, limit, offset },
  };
}

/**
 * GET /doctors/:doctorId
 */
function validateGetDoctor(req) {
  const errors = [];
  const doctorId = requireString(req.params.doctorId, 'doctorId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { doctorId } };
}

/**
 * GET /doctors/:doctorId/schedule
 */
function validateGetDoctorSchedule(req) {
  const errors = [];
  const doctorId = requireString(req.params.doctorId, 'doctorId', errors, { maxLength: 64 });
  const query = req.query || {};

  const branchId = optionalString(query.branchId, 'branchId', errors, { maxLength: 64 });
  const from = parseIsoOrDateOnly(query.from, 'from', errors);
  const to = parseIsoOrDateOnly(query.to, 'to', errors);

  if (from && to) {
    if (from > to) {
      errors.push('from must be before or equal to to');
    } else if (daysBetween(from, to) > SCHEDULE_MAX_RANGE_DAYS) {
      errors.push(`date range must be at most ${SCHEDULE_MAX_RANGE_DAYS} days`);
    }
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { doctorId, branchId, from, to },
  };
}

module.exports = {
  validateListDoctors,
  validateGetDoctor,
  validateGetDoctorSchedule,
};
