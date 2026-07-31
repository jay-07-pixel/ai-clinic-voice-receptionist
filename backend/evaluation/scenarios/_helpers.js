/**
 * Shared scenario helpers for the evaluation harness.
 */

function turn({ user, expectedToolCalls = [], expectedBackendResponses = [], notes } = {}) {
  return {
    user,
    expectedToolCalls,
    expectedBackendResponses,
    notes: notes || null,
  };
}

function tool(name, args = {}, response = { ok: true }) {
  return {
    name,
    args,
    expectedResponse: response,
  };
}

function outcome(spec) {
  return {
    status: spec.status || 'SUCCESS',
    appointmentBooked: Boolean(spec.appointmentBooked),
    appointmentCancelled: Boolean(spec.appointmentCancelled),
    appointmentRescheduled: Boolean(spec.appointmentRescheduled),
    callbackCreated: Boolean(spec.callbackCreated),
    sessionResumed: Boolean(spec.sessionResumed),
    doubleBookingBlocked: Boolean(spec.doubleBookingBlocked),
    language: spec.language || 'en',
    summary: spec.summary || '',
  };
}

module.exports = {
  turn,
  tool,
  outcome,
};
