const {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
  SEARCH_MAX_RANGE_DAYS,
} = require('../dto/availabilityDto');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
const DIGITS_RE = /^\d+$/;

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

function parseIsoDateTime(value, field, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }

  if (DATE_ONLY_RE.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
      errors.push(`${field} must be a valid calendar date`);
      return undefined;
    }
    return date.toISOString();
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

  return date.toISOString();
}

function requireIsoDateTime(value, field, errors) {
  const parsed = parseIsoDateTime(value, field, errors);
  if (!parsed && !errors.some((e) => e.includes(field))) {
    errors.push(`${field} is required`);
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

function parseOffset(value, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return LIST_DEFAULT_OFFSET;
  }

  const asString = String(raw).trim();
  if (!DIGITS_RE.test(asString)) {
    errors.push('offset must be an integer between 0 and 100000');
    return LIST_DEFAULT_OFFSET;
  }

  const parsed = Number.parseInt(asString, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
    errors.push('offset must be an integer between 0 and 100000');
    return LIST_DEFAULT_OFFSET;
  }

  return parsed;
}

function parseBranchIds(value, errors) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value) ? value : String(value).split(',');
  const branchIds = [];

  for (const item of values) {
    if (typeof item !== 'string' || !item.trim()) {
      errors.push('branchIds must be a list of non-empty strings');
      return undefined;
    }
    const trimmed = item.trim();
    if (trimmed.length > 64) {
      errors.push('each branchId must be at most 64 characters');
      return undefined;
    }
    branchIds.push(trimmed);
  }

  if (branchIds.length === 0) {
    return undefined;
  }

  if (branchIds.length > 50) {
    errors.push('branchIds supports at most 50 values');
    return undefined;
  }

  return [...new Set(branchIds)];
}

function assertDateRange(from, to, errors) {
  if (!from || !to) {
    return;
  }

  const start = new Date(from).getTime();
  const end = new Date(to).getTime();

  if (start > end) {
    errors.push('from must be before or equal to to');
    return;
  }

  const days = Math.floor((end - start) / (24 * 60 * 60 * 1000));
  if (days > SEARCH_MAX_RANGE_DAYS) {
    errors.push(`date range must be at most ${SEARCH_MAX_RANGE_DAYS} days`);
  }
}

/**
 * GET /availability
 */
function validateSearchAvailability(req) {
  const errors = [];
  const query = req.query || {};

  const branchId = optionalString(query.branchId, 'branchId', errors, { maxLength: 64 });
  const doctorId = optionalString(query.doctorId, 'doctorId', errors, { maxLength: 64 });
  const departmentId = optionalString(query.departmentId, 'departmentId', errors, {
    maxLength: 64,
  });
  const clinicId = optionalString(query.clinicId, 'clinicId', errors, { maxLength: 64 });
  const from = requireIsoDateTime(query.from, 'from', errors);
  const to = requireIsoDateTime(query.to, 'to', errors);
  const limit = parseLimit(query.limit, errors);
  const offset = parseOffset(query.offset, errors);

  assertDateRange(from, to, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { branchId, doctorId, departmentId, clinicId, from, to, limit, offset },
  };
}

/**
 * GET /availability/earliest
 */
function validateEarliestAvailability(req) {
  const errors = [];
  const query = req.query || {};

  const clinicId = optionalString(query.clinicId, 'clinicId', errors, { maxLength: 64 });
  const branchId = optionalString(query.branchId, 'branchId', errors, { maxLength: 64 });
  const branchIds = parseBranchIds(query.branchIds, errors);
  const doctorId = optionalString(query.doctorId, 'doctorId', errors, { maxLength: 64 });
  const departmentId = optionalString(query.departmentId, 'departmentId', errors, {
    maxLength: 64,
  });
  const from = requireIsoDateTime(query.from, 'from', errors);
  const to = requireIsoDateTime(query.to, 'to', errors);

  assertDateRange(from, to, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  const resolvedBranchIds = branchIds || (branchId ? [branchId] : undefined);

  return {
    error: null,
    value: {
      clinicId,
      branchIds: resolvedBranchIds,
      doctorId,
      departmentId,
      from,
      to,
    },
  };
}

/**
 * POST /availability/slots/:slotId/hold
 */
function validateHoldSlot(req) {
  const errors = [];
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const slotId = requireString(req.params.slotId, 'slotId', errors, { maxLength: 64 });
  const callSessionId = requireString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const idempotencyKey = optionalString(body.idempotencyKey, 'idempotencyKey', errors, {
    minLength: 8,
    maxLength: 128,
  });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { slotId, callSessionId, idempotencyKey },
  };
}

/**
 * POST /availability/slots/:slotId/release
 */
function validateReleaseSlot(req) {
  const errors = [];
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const slotId = requireString(req.params.slotId, 'slotId', errors, { maxLength: 64 });
  const callSessionId = requireString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const idempotencyKey = optionalString(body.idempotencyKey, 'idempotencyKey', errors, {
    minLength: 8,
    maxLength: 128,
  });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { slotId, callSessionId, idempotencyKey },
  };
}

module.exports = {
  validateSearchAvailability,
  validateEarliestAvailability,
  validateHoldSlot,
  validateReleaseSlot,
};
