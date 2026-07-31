const {
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
} = require('../dto/branchDto');

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

function parseBoolean(value, field, errors, defaultValue) {
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

function validateListBranches(req) {
  const errors = [];
  const query = req.query || {};

  const clinicId = optionalString(query.clinicId, 'clinicId', errors, { maxLength: 64 });
  const q = optionalString(query.q, 'q', errors, { maxLength: 100 });
  const activeOnly = parseBoolean(query.activeOnly, 'activeOnly', errors, true);
  const limit = parseLimit(query.limit, errors);
  const offset = parseOffset(query.offset, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: { clinicId, q, activeOnly, limit, offset },
  };
}

function validateGetBranch(req) {
  const errors = [];
  const branchId = requireString(req.params.branchId, 'branchId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { branchId } };
}

function validateListBranchDoctors(req) {
  const errors = [];
  const branchId = requireString(req.params.branchId, 'branchId', errors, { maxLength: 64 });
  const query = req.query || {};
  const limit = parseLimit(query.limit, errors);
  const offset = parseOffset(query.offset, errors);

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { branchId, limit, offset } };
}

function validateGetBranchHours(req) {
  const errors = [];
  const branchId = requireString(req.params.branchId, 'branchId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { branchId } };
}

module.exports = {
  validateListBranches,
  validateGetBranch,
  validateListBranchDoctors,
  validateGetBranchHours,
};
