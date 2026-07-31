const CALLBACK_STATUSES = Object.freeze([
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
]);

const CALLBACK_REASONS = Object.freeze([
  'DROPPED_CALL',
  'MISSED_OUTBOUND',
  'PATIENT_REQUESTED',
  'FOLLOW_UP',
  'OTHER',
]);

/** API source values stored in metadata.source */
const CALLBACK_SOURCES = Object.freeze(['missed_call', 'voicemail', 'manual']);

const SOURCE_TO_REASON = Object.freeze({
  missed_call: 'DROPPED_CALL',
  voicemail: 'OTHER',
  manual: 'PATIENT_REQUESTED',
});

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_PRIORITY = 0;

/** Backoff after each failed attempt (attemptCount 1, 2, …). */
const RETRY_BACKOFF_MS = Object.freeze([
  15 * 60 * 1000, // 15 minutes
  60 * 60 * 1000, // 1 hour
  4 * 60 * 60 * 1000, // 4 hours
]);

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_DEFAULT_OFFSET = 0;

const IDEMPOTENCY_TTL_HOURS = 24;

const MUTABLE_STATUSES = Object.freeze(['PENDING', 'IN_PROGRESS']);

module.exports = {
  CALLBACK_STATUSES,
  CALLBACK_REASONS,
  CALLBACK_SOURCES,
  SOURCE_TO_REASON,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_PRIORITY,
  RETRY_BACKOFF_MS,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
  IDEMPOTENCY_TTL_HOURS,
  MUTABLE_STATUSES,
};
