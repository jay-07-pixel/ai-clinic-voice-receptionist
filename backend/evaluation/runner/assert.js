const KNOWN_TOOLS = Object.freeze([
  'searchAvailability',
  'earliestAvailability',
  'bookAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'findPatient',
  'registerPatient',
  'holdSlot',
  'releaseSlot',
  'resumeCall',
  'saveConversation',
  'createCallback',
  'listPatientAppointments',
  'getDoctor',
  'listDoctors',
  'getBranch',
  'listBranches',
  'getBranchHours',
]);

function deepIncludes(actual, expected) {
  if (expected === undefined) {
    return true;
  }
  if (expected === null) {
    return actual === null;
  }
  if (typeof expected !== 'object') {
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length < expected.length) {
      return false;
    }
    return expected.every((item, index) => deepIncludes(actual[index], item));
  }
  if (!actual || typeof actual !== 'object') {
    return false;
  }
  return Object.keys(expected).every((key) => deepIncludes(actual[key], expected[key]));
}

function assertScenarioShape(scenario) {
  const errors = [];

  if (!scenario?.id) errors.push('missing id');
  if (!scenario?.name) errors.push('missing name');
  if (!scenario?.language) errors.push('missing language');
  if (!Array.isArray(scenario?.turns) || scenario.turns.length === 0) {
    errors.push('turns must be a non-empty array');
  }
  if (!scenario?.expectedFinalOutcome) errors.push('missing expectedFinalOutcome');

  for (const [index, turn] of (scenario.turns || []).entries()) {
    if (!turn.user) errors.push(`turn[${index}] missing user utterance`);
    for (const [tIndex, toolCall] of (turn.expectedToolCalls || []).entries()) {
      if (!toolCall.name) {
        errors.push(`turn[${index}].tool[${tIndex}] missing name`);
      } else if (!KNOWN_TOOLS.includes(toolCall.name)) {
        errors.push(`turn[${index}].tool[${tIndex}] unknown tool "${toolCall.name}"`);
      }
    }
  }

  return errors;
}

function assertToolResponse(expected, actual) {
  if (!expected) {
    return { ok: true };
  }
  if (!deepIncludes(actual, expected)) {
    return {
      ok: false,
      reason: `Tool response mismatch. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    };
  }
  return { ok: true };
}

function assertFinalOutcome(expected, actual) {
  const failures = [];
  const keys = [
    'status',
    'appointmentBooked',
    'appointmentCancelled',
    'appointmentRescheduled',
    'callbackCreated',
    'sessionResumed',
    'doubleBookingBlocked',
    'language',
  ];

  for (const key of keys) {
    if (expected[key] !== undefined && expected[key] !== actual[key]) {
      failures.push(`${key}: expected=${expected[key]} actual=${actual[key]}`);
    }
  }

  return {
    ok: failures.length === 0,
    reason: failures.length ? failures.join('; ') : null,
  };
}

module.exports = {
  KNOWN_TOOLS,
  deepIncludes,
  assertScenarioShape,
  assertToolResponse,
  assertFinalOutcome,
};
