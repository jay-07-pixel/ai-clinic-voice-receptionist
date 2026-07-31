/**
 * Maps Retell webhook payloads and CallSession patches to stable shapes.
 */

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

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

function pickCall(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return asObject(payload.call || payload.data?.call || payload);
}

function extractExternalCallId(payload) {
  const call = pickCall(payload);
  return (
    call.call_id ||
    call.callId ||
    call.externalCallId ||
    payload.call_id ||
    payload.externalCallId ||
    null
  );
}

function extractDirection(call) {
  const raw = String(call.direction || call.call_type || 'inbound').toUpperCase();
  if (raw.includes('OUT')) {
    return 'OUTBOUND';
  }
  return 'INBOUND';
}

function extractPhoneFields(call) {
  const fromNumber = call.from_number || call.fromNumber || call.caller_id || null;
  const toNumber = call.to_number || call.toNumber || null;
  const phone = fromNumber || toNumber || null;
  return { fromNumber, toNumber, phone };
}

function normalizeTranscript(transcript) {
  if (!transcript) {
    return [];
  }

  if (typeof transcript === 'string') {
    return [{ role: 'system', content: transcript }];
  }

  if (!Array.isArray(transcript)) {
    return [];
  }

  return transcript.map((entry) => {
    if (typeof entry === 'string') {
      return { role: 'unknown', content: entry };
    }
    return {
      role: entry.role || entry.speaker || 'unknown',
      content: entry.content || entry.text || entry.utterance || '',
      timestamp: entry.timestamp || entry.created_at || null,
    };
  });
}

function extractSummary(call, payload) {
  const analysis = asObject(call.call_analysis || call.analysis || payload.call_analysis);
  return (
    analysis.call_summary ||
    analysis.summary ||
    call.summary ||
    payload.summary ||
    null
  );
}

function toWebhookAck({ event, externalCallId, handled, result, sessionId }) {
  return {
    event,
    externalCallId: externalCallId || null,
    handled: Boolean(handled),
    sessionId: sessionId || null,
    result: result ?? null,
  };
}

function toToolError(error) {
  const statusCode = error?.statusCode || 500;
  const retryable = statusCode >= 500 || error?.code === 'SLOT_UNAVAILABLE';

  return {
    ok: false,
    error: {
      code: error?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ERROR'),
      message: error?.isOperational ? error.message : 'Tool execution failed',
      retryable,
      ...(error?.details ? { details: error.details } : {}),
    },
  };
}

function toToolSuccess(data) {
  return {
    ok: true,
    ...data,
  };
}

module.exports = {
  asObject,
  asArray,
  toIsoDateTime,
  pickCall,
  extractExternalCallId,
  extractDirection,
  extractPhoneFields,
  normalizeTranscript,
  extractSummary,
  toWebhookAck,
  toToolError,
  toToolSuccess,
};
