const {
  CALL_DIRECTIONS,
} = require('../dto/callSessionDto');

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

function optionalArray(value, field, errors) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return undefined;
  }

  return value;
}

function validateCreateCallSession(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;

  const externalCallId = optionalString(body.externalCallId ?? body.retellCallId, 'externalCallId', errors, {
    maxLength: 128,
  });
  const directionRaw = optionalString(body.direction, 'direction', errors, { maxLength: 16 }) || 'INBOUND';
  if (!CALL_DIRECTIONS.includes(directionRaw)) {
    errors.push(`direction must be one of: ${CALL_DIRECTIONS.join(', ')}`);
  }

  const language = optionalString(body.language, 'language', errors, { maxLength: 16 }) || 'en';
  const phone = optionalString(body.phone, 'phone', errors, { maxLength: 32 });
  const fromNumber =
    optionalString(body.fromNumber, 'fromNumber', errors, { maxLength: 32 }) || phone;
  const toNumber = optionalString(body.toNumber, 'toNumber', errors, { maxLength: 32 });
  const patientId = optionalString(body.patientId, 'patientId', errors, { maxLength: 64 });
  const branchId = optionalString(body.branchId, 'branchId', errors, { maxLength: 64 });
  const promptVersion = optionalString(body.promptVersion, 'promptVersion', errors, {
    maxLength: 64,
  });
  const modelVersion = optionalString(body.modelVersion, 'modelVersion', errors, { maxLength: 64 });
  const metadata = optionalObject(body.metadata, 'metadata', errors);
  const idempotencyKey = resolveIdempotencyKey(req, body, errors);

  if (!idempotencyKey && !externalCallId) {
    errors.push('idempotencyKey or externalCallId is required');
  }

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return {
    error: null,
    value: {
      externalCallId,
      direction: directionRaw,
      language,
      phone,
      fromNumber,
      toNumber,
      patientId,
      branchId,
      promptVersion,
      modelVersion,
      metadata,
      idempotencyKey: idempotencyKey || `call_create_${externalCallId}`,
    },
  };
}

function validateGetCallSession(req) {
  const errors = [];
  const sessionId = requireString(req.params.sessionId, 'sessionId', errors, { maxLength: 64 });

  if (errors.length > 0) {
    return { error: errors.join('; '), value: null };
  }

  return { error: null, value: { sessionId } };
}

function validateResumeCallSession(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;
  const sessionId = requireString(req.params.sessionId, 'sessionId', errors, { maxLength: 64 });
  const externalCallId = optionalString(body.externalCallId ?? body.retellCallId, 'externalCallId', errors, {
    maxLength: 128,
  });
  const recoveryToken = optionalString(body.recoveryToken, 'recoveryToken', errors, {
    maxLength: 128,
  });
  const reason = optionalString(body.reason, 'reason', errors, { maxLength: 64 });
  const metadata = optionalObject(body.metadata, 'metadata', errors);
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
      sessionId,
      externalCallId,
      recoveryToken,
      reason: reason || 'DROPPED_CALL',
      metadata,
      idempotencyKey,
    },
  };
}

function validateEndCallSession(req) {
  const bodyError = requireBodyObject(req.body);
  if (bodyError) {
    return { error: bodyError, value: null };
  }

  const errors = [];
  const body = req.body;
  const sessionId = requireString(req.params.sessionId, 'sessionId', errors, { maxLength: 64 });
  const summary = optionalString(body.summary, 'summary', errors, { maxLength: 4000 });
  const transcript = optionalArray(body.transcript, 'transcript', errors);
  const metadata = optionalObject(body.metadata, 'metadata', errors);
  const releaseHolds = body.releaseHolds === undefined ? true : Boolean(body.releaseHolds);
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
      sessionId,
      summary,
      transcript,
      metadata,
      releaseHolds,
      idempotencyKey,
    },
  };
}

module.exports = {
  validateCreateCallSession,
  validateGetCallSession,
  validateResumeCallSession,
  validateEndCallSession,
};
