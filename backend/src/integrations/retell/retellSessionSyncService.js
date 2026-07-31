const crypto = require('crypto');
const { AppError } = require('../../middleware/errorHandler');
const { normalizeToE164 } = require('../../utils/phone');
const CallSessionService = require('../../services/callSessionService');
const CallbackService = require('../../services/callbackService');
const RetellSessionPatchRepository = require('./retellSessionPatchRepository');
const {
  asObject,
  asArray,
  extractDirection,
  extractPhoneFields,
  normalizeTranscript,
  extractSummary,
  pickCall,
} = require('./retellMapper');

function mergeConversationState(existing, patch) {
  const base = asObject(existing);
  const next = asObject(patch);

  return {
    ...base,
    ...next,
    extractedEntities: {
      ...asObject(base.extractedEntities),
      ...asObject(next.extractedEntities),
    },
    toolHistory: Array.isArray(next.toolHistory)
      ? next.toolHistory
      : asArray(base.toolHistory),
  };
}

function appendToolHistory(existingState, entry) {
  const state = asObject(existingState);
  const history = asArray(state.toolHistory);
  return {
    ...state,
    toolHistory: [...history, entry].slice(-200),
  };
}

class RetellSessionSyncService {
  /**
   * @param {object} [deps]
   */
  constructor({
    callSessionService = new CallSessionService(),
    callbackService = new CallbackService(),
    patchRepository = new RetellSessionPatchRepository(),
  } = {}) {
    this.callSessionService = callSessionService;
    this.callbackService = callbackService;
    this.patchRepository = patchRepository;
  }

  async resolveSession({ sessionId, externalCallId }) {
    if (sessionId) {
      const byId = await this.patchRepository.findById(sessionId);
      if (byId) {
        return byId;
      }
    }

    if (externalCallId) {
      return this.patchRepository.findByExternalCallId(externalCallId);
    }

    return null;
  }

  async onCallStarted(payload) {
    const call = pickCall(payload);
    const externalCallId = call.call_id || call.callId || payload.externalCallId;
    if (!externalCallId) {
      throw new AppError('call.call_id is required for call_started', 400, {
        code: 'VALIDATION_ERROR',
      });
    }

    const { fromNumber, toNumber, phone } = extractPhoneFields(call);
    const metadata = {
      retell: {
        agentId: call.agent_id || call.agentId || null,
        event: 'call_started',
      },
      ...(asObject(call.metadata)),
    };

    const result = await this.callSessionService.createSession({
      externalCallId,
      direction: extractDirection(call),
      language: call.language || 'en',
      phone,
      fromNumber,
      toNumber,
      patientId: call.patient_id || call.patientId || null,
      branchId: call.branch_id || call.branchId || metadata.branchId || null,
      metadata,
      idempotencyKey: `retell_start_${externalCallId}`,
    });

    return {
      sessionId: result.callSession.id,
      status: result.callSession.status,
      recoveryToken: result.callSession.recoveryToken,
      replayed: result.replayed,
    };
  }

  async onTranscriptUpdated(payload) {
    const call = pickCall(payload);
    const externalCallId = call.call_id || call.callId || payload.externalCallId;
    const session = await this.resolveSession({
      sessionId: payload.callSessionId,
      externalCallId,
    });

    if (!session) {
      throw new AppError('Call session not found for transcript update', 404, {
        code: 'NOT_FOUND',
      });
    }

    const incoming = normalizeTranscript(
      payload.transcript || call.transcript || call.transcript_object,
    );

    const transcript =
      incoming.length > 0 ? incoming : asArray(session.transcript);

    const updated = await this.patchRepository.patchById(session.id, {
      transcript,
      conversationState: mergeConversationState(session.conversationState, {
        lastTranscriptAt: new Date().toISOString(),
      }),
    });

    return {
      sessionId: updated.id,
      transcriptLength: asArray(updated.transcript).length,
    };
  }

  async onCallAnalyzed(payload) {
    const call = pickCall(payload);
    const externalCallId = call.call_id || call.callId || payload.externalCallId;
    const session = await this.resolveSession({
      sessionId: payload.callSessionId,
      externalCallId,
    });

    if (!session) {
      throw new AppError('Call session not found for call_analyzed', 404, {
        code: 'NOT_FOUND',
      });
    }

    const summary = extractSummary(call, payload);
    const analysis = asObject(call.call_analysis || payload.call_analysis);
    const transcript = normalizeTranscript(
      payload.transcript || call.transcript || call.transcript_object,
    );

    const metadata = {
      ...asObject(session.metadata),
      retellAnalysis: analysis,
    };

    const updated = await this.patchRepository.patchById(session.id, {
      summary: summary || session.summary,
      ...(transcript.length > 0 ? { transcript } : {}),
      metadata,
      conversationState: mergeConversationState(session.conversationState, {
        analysisSavedAt: new Date().toISOString(),
        extractedEntities: {
          ...asObject(asObject(session.conversationState).extractedEntities),
          ...asObject(analysis.custom_analysis_data),
        },
      }),
    });

    return {
      sessionId: updated.id,
      summary: updated.summary,
    };
  }

  async onCallEnded(payload) {
    const call = pickCall(payload);
    const externalCallId = call.call_id || call.callId || payload.externalCallId;
    const session = await this.resolveSession({
      sessionId: payload.callSessionId,
      externalCallId,
    });

    if (!session) {
      throw new AppError('Call session not found for call_ended', 404, {
        code: 'NOT_FOUND',
      });
    }

    const transcript = normalizeTranscript(
      payload.transcript || call.transcript || call.transcript_object,
    );
    const summary = extractSummary(call, payload) || session.summary;
    const disconnection =
      call.disconnection_reason || call.disconnectionReason || payload.disconnection_reason;

    const endResult = await this.callSessionService.endSession({
      sessionId: session.id,
      summary,
      transcript: transcript.length > 0 ? transcript : undefined,
      metadata: {
        retell: {
          event: 'call_ended',
          disconnectionReason: disconnection || null,
          durationMs: call.duration_ms || call.durationMs || null,
        },
      },
      releaseHolds: true,
      idempotencyKey: `retell_end_${externalCallId || session.id}`,
    });

    let callback = null;
    const createCallback = payload.createCallback === true;

    if (createCallback) {
      const phone = session.fromNumber || session.toNumber;
      if (phone) {
        const cb = await this.callbackService.createCallback({
          phone,
          phoneE164: normalizeToE164(phone),
          patientId: session.patientId,
          branchId: session.branchId,
          callSessionId: session.id,
          reason: 'DROPPED_CALL',
          source: 'missed_call',
          priority: 10,
          maxAttempts: 3,
          preferredTime: null,
          notes: `Auto-queued from Retell call_ended (${disconnection || 'unknown'})`,
          metadata: {
            source: 'missed_call',
            externalCallId,
            disconnectionReason: disconnection || null,
          },
          idempotencyKey: `retell_cb_${externalCallId || session.id}`,
        });
        callback = cb.callback;
      }
    }

    return {
      sessionId: endResult.callSession.id,
      status: endResult.callSession.status,
      releasedHoldCount: endResult.releasedHoldCount || 0,
      callbackRequest: callback,
      replayed: endResult.replayed,
    };
  }

  async recordToolCall({ sessionId, externalCallId, toolName, toolCallId, args }) {
    const session = await this.resolveSession({ sessionId, externalCallId });
    if (!session) {
      return null;
    }

    const entry = {
      type: 'tool_call',
      toolName,
      toolCallId: toolCallId || null,
      args: asObject(args),
      at: new Date().toISOString(),
    };

    const updated = await this.patchRepository.patchById(session.id, {
      conversationState: appendToolHistory(session.conversationState, entry),
    });

    return { sessionId: updated.id };
  }

  async recordToolResult({
    sessionId,
    externalCallId,
    toolName,
    toolCallId,
    result,
    ok,
  }) {
    const session = await this.resolveSession({ sessionId, externalCallId });
    if (!session) {
      return null;
    }

    const entry = {
      type: 'tool_result',
      toolName,
      toolCallId: toolCallId || null,
      ok: ok !== false,
      result: result ?? null,
      at: new Date().toISOString(),
    };

    const updated = await this.patchRepository.patchById(session.id, {
      conversationState: appendToolHistory(session.conversationState, entry),
    });

    return { sessionId: updated.id };
  }

  async saveConversation(args = {}) {
    const session = await this.resolveSession({
      sessionId: args.callSessionId || args.sessionId,
      externalCallId: args.externalCallId,
    });

    if (!session) {
      throw new AppError('Call session not found', 404, { code: 'NOT_FOUND' });
    }

    const transcriptAppend = asArray(args.transcriptAppend);
    const transcript =
      transcriptAppend.length > 0
        ? [...asArray(session.transcript), ...normalizeTranscript(transcriptAppend)]
        : undefined;

    const conversationState = mergeConversationState(
      session.conversationState,
      args.conversationState,
    );

    const updated = await this.patchRepository.patchById(session.id, {
      ...(args.currentIntent !== undefined ? { currentIntent: args.currentIntent } : {}),
      ...(args.currentStep !== undefined ? { currentStep: args.currentStep } : {}),
      ...(args.patientId !== undefined ? { patientId: args.patientId } : {}),
      ...(args.promptVersion !== undefined ? { promptVersion: args.promptVersion } : {}),
      ...(args.modelVersion !== undefined ? { modelVersion: args.modelVersion } : {}),
      ...(transcript ? { transcript } : {}),
      conversationState,
    });

    return {
      savedAt: new Date().toISOString(),
      sessionId: updated.id,
    };
  }

  createIdempotencyKey(prefix, parts = []) {
    const raw = [prefix, ...parts.filter(Boolean)].join('_');
    if (raw.length >= 8 && raw.length <= 128) {
      return raw;
    }
    return `${prefix}_${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
  }
}

module.exports = RetellSessionSyncService;
