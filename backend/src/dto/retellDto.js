const WEBHOOK_EVENTS = Object.freeze([
  'call_started',
  'call_ended',
  'call_analyzed',
  'transcript_updated',
  'tool_call',
  'tool_result',
]);

const TOOL_NAMES = Object.freeze([
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

/** Signature timestamp must be within this window (ms). */
const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

const SESSION_PATCH_SELECT = Object.freeze({
  id: true,
  status: true,
  externalCallId: true,
  direction: true,
  language: true,
  patientId: true,
  branchId: true,
  fromNumber: true,
  toNumber: true,
  currentIntent: true,
  currentStep: true,
  promptVersion: true,
  modelVersion: true,
  transcript: true,
  summary: true,
  conversationState: true,
  metadata: true,
  recoveryToken: true,
  startedAt: true,
  lastActivityAt: true,
  endedAt: true,
  droppedAt: true,
  createdAt: true,
  updatedAt: true,
});

module.exports = {
  WEBHOOK_EVENTS,
  TOOL_NAMES,
  SIGNATURE_TOLERANCE_MS,
  SESSION_PATCH_SELECT,
};
