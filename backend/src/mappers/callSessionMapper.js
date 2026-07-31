/**
 * Maps CallSession records to API response shapes.
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPublicStatus(status) {
  if (status === 'IN_PROGRESS') {
    return 'ACTIVE';
  }
  return status;
}

function splitConversationState(conversationState) {
  const state = asObject(conversationState);
  const {
    extractedEntities = {},
    toolHistory = [],
    ...currentState
  } = state;

  return {
    extractedEntities: asObject(extractedEntities),
    toolHistory: asArray(toolHistory),
    currentState,
  };
}

function toCallSessionSummary(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: toPublicStatus(session.status),
    direction: session.direction,
    language: session.language ?? null,
    externalCallId: session.externalCallId ?? null,
    recoveryToken: session.recoveryToken ?? null,
    patientId: session.patientId ?? null,
    branchId: session.branchId ?? null,
    fromNumber: session.fromNumber ?? null,
    toNumber: session.toNumber ?? null,
    currentIntent: session.currentIntent ?? null,
    currentStep: session.currentStep ?? null,
    startedAt: toIsoDateTime(session.startedAt),
    lastActivityAt: toIsoDateTime(session.lastActivityAt),
    endedAt: toIsoDateTime(session.endedAt),
    droppedAt: toIsoDateTime(session.droppedAt),
  };
}

function toCallSessionDetail(session, heldSlots = []) {
  if (!session) {
    return null;
  }

  const { extractedEntities, toolHistory, currentState } = splitConversationState(
    session.conversationState,
  );

  return {
    ...toCallSessionSummary(session),
    promptVersion: session.promptVersion ?? null,
    modelVersion: session.modelVersion ?? null,
    transcript: asArray(session.transcript),
    summary: session.summary ?? null,
    extractedEntities,
    toolHistory,
    currentState,
    metadata: asObject(session.metadata),
    activeSlotHolds: heldSlots.map((slot) => ({
      slotId: slot.id,
      status: slot.status,
      holdExpiresAt: toIsoDateTime(slot.holdExpiresAt),
      startsAt: toIsoDateTime(slot.startsAt),
      endsAt: toIsoDateTime(slot.endsAt),
    })),
    createdAt: toIsoDateTime(session.createdAt),
    updatedAt: toIsoDateTime(session.updatedAt),
  };
}

function toCreateResponse(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    status: toPublicStatus(session.status),
    recoveryToken: session.recoveryToken ?? null,
    externalCallId: session.externalCallId ?? null,
  };
}

module.exports = {
  toCallSessionSummary,
  toCallSessionDetail,
  toCreateResponse,
  toPublicStatus,
  splitConversationState,
  toIsoDateTime,
};
