const SYNC_ENTITY_TYPES = Object.freeze([
  'BRANCH',
  'DEPARTMENT',
  'DOCTOR',
  'PATIENT',
  'APPOINTMENT',
  'SLOT',
]);

const SYNC_STATUSES = Object.freeze([
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
  'CONFLICT',
]);

const SYNC_DIRECTIONS = Object.freeze(['INBOUND', 'OUTBOUND', 'BIDIRECTIONAL']);

const ERROR_CODES = Object.freeze({
  NETWORK_ERROR: 'NETWORK_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH_ERROR: 'AUTH_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

/** Permanent errors are not auto-retried. */
const PERMANENT_ERROR_CODES = Object.freeze([
  ERROR_CODES.AUTH_ERROR,
  ERROR_CODES.VALIDATION_ERROR,
]);

const LIST_DEFAULT_LIMIT = 50;
const LIST_MAX_LIMIT = 100;
const LIST_DEFAULT_OFFSET = 0;

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_BACKOFF_MS = 500;

/** Backoff before a PENDING row becomes claimable again after a transient failure. */
const RETRY_BACKOFF_MS = Object.freeze([
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
]);

const SYNC_SELECT = Object.freeze({
  id: true,
  entityType: true,
  localId: true,
  clinikoId: true,
  direction: true,
  status: true,
  lastSyncedAt: true,
  lastAttemptAt: true,
  attemptCount: true,
  payloadHash: true,
  requestPayload: true,
  responsePayload: true,
  errorMessage: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
});

module.exports = {
  SYNC_ENTITY_TYPES,
  SYNC_STATUSES,
  SYNC_DIRECTIONS,
  ERROR_CODES,
  PERMANENT_ERROR_CODES,
  LIST_DEFAULT_LIMIT,
  LIST_MAX_LIMIT,
  LIST_DEFAULT_OFFSET,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BASE_BACKOFF_MS,
  RETRY_BACKOFF_MS,
  SYNC_SELECT,
};
