const {
  SYNC_ENTITY_TYPES,
  SYNC_STATUSES,
  SYNC_DIRECTIONS,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
  DEFAULT_BATCH_SIZE,
} = require('../dto/clinikoDto');

const DIGITS_RE = /^\d+$/;

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
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

  if (typeof raw !== 'string' || !raw.trim()) {
    errors.push(`${field} is required`);
    return undefined;
  }

  const trimmed = raw.trim();
  if (maxLength && trimmed.length > maxLength) {
    errors.push(`${field} must be at most ${maxLength} characters`);
  }

  return trimmed;
}

function parseBoolean(value, field, errors, defaultValue = false) {
  const raw = firstValue(value);
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
  }
  errors.push(`${field} must be a boolean`);
  return defaultValue;
}

function parseLimit(value, errors, { defaultLimit = LIST_DEFAULT_LIMIT, max = LIST_MAX_LIMIT } = {}) {
  const raw = firstValue(value);
  if (raw === undefined || raw === null || raw === '') {
    return defaultLimit;
  }
  const asString = String(raw).trim();
  if (!DIGITS_RE.test(asString)) {
    errors.push(`limit must be an integer between 1 and ${max}`);
    return defaultLimit;
  }
  const parsed = Number.parseInt(asString, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    errors.push(`limit must be an integer between 1 and ${max}`);
    return defaultLimit;
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

function validateProcessOrEnqueueSync(req) {
  const body = req.body;

  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  const errors = [];
  const process = parseBoolean(body.process, 'process', errors, true);
  const localId = optionalString(body.localId, 'localId', errors, { maxLength: 64 });
  const entityTypeRaw = optionalString(body.entityType, 'entityType', errors, { maxLength: 32 });
  const directionRaw = optionalString(body.direction, 'direction', errors, { maxLength: 32 });
  const force = parseBoolean(body.force, 'force', errors, false);
  const limit = parseLimit(body.limit, errors, {
    defaultLimit: DEFAULT_BATCH_SIZE,
    max: LIST_MAX_LIMIT,
  });
  const metadata = optionalObject(body.metadata, 'metadata', errors);

  let entityType;
  if (entityTypeRaw) {
    entityType = entityTypeRaw.toUpperCase();
    if (!SYNC_ENTITY_TYPES.includes(entityType)) {
      errors.push(`entityType must be one of: ${SYNC_ENTITY_TYPES.join(', ')}`);
    }
  }

  let direction;
  if (directionRaw) {
    direction = directionRaw.toUpperCase();
    if (!SYNC_DIRECTIONS.includes(direction)) {
      errors.push(`direction must be one of: ${SYNC_DIRECTIONS.join(', ')}`);
    }
  }

  // Enqueue mode when localId provided.
  if (localId && !entityType) {
    errors.push('entityType is required when localId is provided');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      mode: localId ? 'enqueue' : 'process',
      process: localId ? false : process,
      entityType,
      localId,
      direction: direction || 'OUTBOUND',
      force,
      limit,
      metadata,
    },
  };
}

function validateListSync(req) {
  const errors = [];
  const query = req.query || {};

  const statusRaw = optionalString(query.status, 'status', errors, { maxLength: 32 });
  let status;
  if (statusRaw) {
    status = statusRaw.toUpperCase();
    if (!SYNC_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${SYNC_STATUSES.join(', ')}`);
    }
  }

  const entityTypeRaw = optionalString(query.entityType, 'entityType', errors, { maxLength: 32 });
  let entityType;
  if (entityTypeRaw) {
    entityType = entityTypeRaw.toUpperCase();
    if (!SYNC_ENTITY_TYPES.includes(entityType)) {
      errors.push(`entityType must be one of: ${SYNC_ENTITY_TYPES.join(', ')}`);
    }
  }

  const localId = optionalString(query.localId, 'localId', errors, { maxLength: 64 });
  const limit = parseLimit(query.limit, errors);
  const offset = parseOffset(query.offset, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { status, entityType, localId, limit, offset },
  };
}

function validateGetSync(req) {
  const errors = [];
  const id = requireString(req.params.id, 'id', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { id } };
}

function validateClinikoWebhook(req) {
  if (req.body == null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return { error: 'Request body must be a JSON object', value: null };
  }

  return { error: null, value: req.body };
}

module.exports = {
  validateProcessOrEnqueueSync,
  validateListSync,
  validateGetSync,
  validateClinikoWebhook,
};
