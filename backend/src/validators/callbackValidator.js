const {
  CALLBACK_STATUSES,
  CALLBACK_REASONS,
  CALLBACK_SOURCES,
  SOURCE_TO_REASON,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_PRIORITY,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
} = require('../dto/callbackDto');
const { normalizeToE164 } = require('../utils/phone');

const DIGITS_RE = /^\d+$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
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

  if (typeof raw !== 'string' || !raw.trim()) {
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

function resolveIdempotencyKey(req, body, errors, { required = false } = {}) {
  const fromHeader = optionalString(req.headers?.['idempotency-key'], 'Idempotency-Key', errors, {
    minLength: 8,
    maxLength: 128,
  });
  const fromBody = optionalString(body?.idempotencyKey, 'idempotencyKey', errors, {
    minLength: 8,
    maxLength: 128,
  });

  if (fromHeader && fromBody && fromHeader !== fromBody) {
    errors.push('Idempotency-Key header and idempotencyKey body must match');
  }

  const key = fromHeader || fromBody;
  if (required && !key) {
    errors.push('idempotencyKey or Idempotency-Key header is required');
  }

  return key;
}

function optionalObject(value, field, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} must be an object`);
    return undefined;
  }

  return value;
}

function parseOptionalInt(value, field, errors, { min, max } = {}) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if ((min !== undefined && raw < min) || (max !== undefined && raw > max)) {
      errors.push(`${field} must be an integer between ${min} and ${max}`);
    }
    return raw;
  }

  if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)) {
      errors.push(`${field} must be an integer between ${min} and ${max}`);
    }
    return parsed;
  }

  errors.push(`${field} must be an integer`);
  return undefined;
}

function parseDateTime(value, field, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) {
      errors.push(`${field} must be a valid ISO datetime`);
      return undefined;
    }
    return raw;
  }

  if (typeof raw !== 'string') {
    errors.push(`${field} must be an ISO datetime string`);
    return undefined;
  }

  const date = new Date(raw.trim());
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid ISO datetime`);
    return undefined;
  }

  return date;
}

function parseDateOnly(value, field, errors) {
  const raw = firstValue(value);

  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }

  if (typeof raw !== 'string' || !DATE_ONLY_RE.test(raw.trim())) {
    errors.push(`${field} must be a date in YYYY-MM-DD format`);
    return undefined;
  }

  const trimmed = raw.trim();
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date`);
    return undefined;
  }

  return trimmed;
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
    errors.push('offset must be a non-negative integer');
    return LIST_DEFAULT_OFFSET;
  }

  const parsed = Number.parseInt(asString, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push('offset must be a non-negative integer');
    return LIST_DEFAULT_OFFSET;
  }

  return parsed;
}

function normalizeReason(rawReason, source, errors) {
  if (rawReason) {
    const upper = rawReason.toUpperCase();
    if (CALLBACK_REASONS.includes(upper)) {
      return upper;
    }
    errors.push(`reason must be one of: ${CALLBACK_REASONS.join(', ')}`);
    return undefined;
  }

  if (source && SOURCE_TO_REASON[source]) {
    return SOURCE_TO_REASON[source];
  }

  return 'DROPPED_CALL';
}

function validateCreateCallback(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const phone = requireString(body.phone, 'phone', errors, { maxLength: 32 });
  const phoneE164 = phone ? normalizeToE164(phone) : null;
  if (phone && !phoneE164) {
    errors.push('phone could not be normalized to E.164');
  }

  const patientId = optionalString(body.patientId, 'patientId', errors, { maxLength: 64 });
  const branchId = optionalString(body.branchId, 'branchId', errors, { maxLength: 64 });
  const callSessionId = optionalString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const preferredTime = parseDateTime(body.preferredTime, 'preferredTime', errors);
  const notes = optionalString(body.notes, 'notes', errors, { maxLength: 2000 });
  const metadata = optionalObject(body.metadata, 'metadata', errors) || {};

  const sourceRaw = optionalString(body.source, 'source', errors, { maxLength: 32 });
  let source;
  if (sourceRaw) {
    source = sourceRaw.toLowerCase();
    if (!CALLBACK_SOURCES.includes(source)) {
      errors.push(`source must be one of: ${CALLBACK_SOURCES.join(', ')}`);
    }
  } else {
    errors.push('source is required');
  }

  const reasonRaw = optionalString(body.reason, 'reason', errors, { maxLength: 32 });
  const reason = normalizeReason(reasonRaw, source, errors);

  const priority =
    parseOptionalInt(body.priority, 'priority', errors, { min: 0, max: 100 }) ?? DEFAULT_PRIORITY;
  const maxAttempts =
    parseOptionalInt(body.maxAttempts, 'maxAttempts', errors, { min: 1, max: 10 }) ??
    DEFAULT_MAX_ATTEMPTS;

  const idempotencyKey = resolveIdempotencyKey(req, body, errors, { required: true });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      phone,
      phoneE164,
      patientId,
      branchId,
      callSessionId,
      preferredTime,
      reason,
      source,
      priority,
      maxAttempts,
      notes,
      metadata: {
        ...metadata,
        source,
        ...(preferredTime ? { preferredTime: preferredTime.toISOString() } : {}),
      },
      idempotencyKey,
    },
  };
}

function validateListCallbacks(req) {
  const errors = [];
  const query = req.query || {};

  const statusRaw = optionalString(query.status, 'status', errors, { maxLength: 32 });
  let status;
  if (statusRaw) {
    status = statusRaw.toUpperCase();
    if (!CALLBACK_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${CALLBACK_STATUSES.join(', ')}`);
    }
  }

  const branchId = optionalString(query.branchId, 'branchId', errors, { maxLength: 64 });
  const priority = parseOptionalInt(query.priority, 'priority', errors, { min: 0, max: 100 });
  const scheduledDate = parseDateOnly(
    query.scheduledDate ?? query.scheduled_date,
    'scheduledDate',
    errors,
  );
  const limit = parseLimit(query.limit, errors);
  const offset = parseOffset(query.offset, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      status,
      branchId,
      priority,
      scheduledDate,
      limit,
      offset,
    },
  };
}

function validateGetCallback(req) {
  const errors = [];
  const callbackId = requireString(req.params.callbackId, 'callbackId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { callbackId } };
}

function validateCompleteCallback(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;
  const callbackId = requireString(req.params.callbackId, 'callbackId', errors, { maxLength: 64 });
  const callSessionId = optionalString(body.callSessionId, 'callSessionId', errors, {
    maxLength: 64,
  });
  const notes = optionalString(body.notes, 'notes', errors, { maxLength: 2000 });
  const metadata = optionalObject(body.metadata, 'metadata', errors);
  const idempotencyKey = resolveIdempotencyKey(req, body, errors, { required: true });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      callbackId,
      callSessionId,
      notes,
      metadata,
      idempotencyKey,
    },
  };
}

function validateFailCallback(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;
  const callbackId = requireString(req.params.callbackId, 'callbackId', errors, { maxLength: 64 });
  const notes = optionalString(body.notes, 'notes', errors, { maxLength: 2000 });
  const metadata = optionalObject(body.metadata, 'metadata', errors);
  const nextAttemptAt = parseDateTime(body.nextAttemptAt, 'nextAttemptAt', errors);
  const idempotencyKey = resolveIdempotencyKey(req, body, errors, { required: true });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      callbackId,
      notes,
      metadata,
      nextAttemptAt,
      idempotencyKey,
    },
  };
}

module.exports = {
  validateCreateCallback,
  validateListCallbacks,
  validateGetCallback,
  validateCompleteCallback,
  validateFailCallback,
};
