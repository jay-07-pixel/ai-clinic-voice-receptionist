/**
 * Maps CallbackRequest records to API response shapes.
 */

function toIsoDateTime(value) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function extractSource(metadata) {
  const meta = asObject(metadata);
  return typeof meta.source === 'string' ? meta.source : null;
}

function extractPreferredTime(metadata, nextAttemptAt) {
  const meta = asObject(metadata);
  if (typeof meta.preferredTime === 'string') {
    return meta.preferredTime;
  }
  return toIsoDateTime(nextAttemptAt);
}

function toLinkedPatient(patient) {
  if (!patient) {
    return null;
  }

  return {
    id: patient.id,
    fullName: patient.fullName ?? null,
    phone: patient.phone ?? null,
    phoneE164: patient.phoneE164 ?? null,
    preferredLanguage: patient.preferredLanguage ?? null,
  };
}

function toLinkedCallSession(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: session.status === 'IN_PROGRESS' ? 'ACTIVE' : session.status,
    direction: session.direction ?? null,
    externalCallId: session.externalCallId ?? null,
    startedAt: toIsoDateTime(session.startedAt),
    endedAt: toIsoDateTime(session.endedAt),
  };
}

function toCallbackSummary(callback) {
  if (!callback) {
    return null;
  }

  const metadata = asObject(callback.metadata);

  return {
    id: callback.id,
    status: callback.status,
    phone: callback.phone,
    phoneE164: callback.phoneE164 ?? null,
    patientId: callback.patientId ?? null,
    branchId: callback.branchId ?? null,
    callSessionId: callback.callSessionId ?? null,
    reason: callback.reason,
    source: extractSource(metadata),
    priority: callback.priority ?? 0,
    retryCount: callback.attemptCount ?? 0,
    maxAttempts: callback.maxAttempts ?? 3,
    preferredTime: extractPreferredTime(metadata, callback.nextAttemptAt),
    nextAttemptAt: toIsoDateTime(callback.nextAttemptAt),
    lastAttemptAt: toIsoDateTime(callback.lastAttemptAt),
    notes: callback.notes ?? null,
    createdAt: toIsoDateTime(callback.createdAt),
    updatedAt: toIsoDateTime(callback.updatedAt),
  };
}

function toCallbackDetail(callback) {
  if (!callback) {
    return null;
  }

  return {
    ...toCallbackSummary(callback),
    patient: toLinkedPatient(callback.patient),
    callSession: toLinkedCallSession(callback.callSession),
    completedAt: toIsoDateTime(callback.completedAt),
    failedAt: toIsoDateTime(callback.failedAt),
    metadata: asObject(callback.metadata),
  };
}

function toCreateResponse(callback) {
  if (!callback) {
    return null;
  }

  return {
    id: callback.id,
    status: callback.status,
    nextAttemptAt: toIsoDateTime(callback.nextAttemptAt),
    priority: callback.priority ?? 0,
    source: extractSource(callback.metadata),
  };
}

module.exports = {
  toCallbackSummary,
  toCallbackDetail,
  toCreateResponse,
  toIsoDateTime,
  asObject,
};
