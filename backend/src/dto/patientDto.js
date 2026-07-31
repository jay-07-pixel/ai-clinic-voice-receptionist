const GENDER_VALUES = Object.freeze(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN']);

const APPOINTMENT_STATUS_VALUES = Object.freeze([
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
]);

/**
 * @typedef {object} PatientLookupQueryDto
 * @property {string} [phone]
 * @property {string} [fullName]
 * @property {string} [dateOfBirth] YYYY-MM-DD
 */

/**
 * @typedef {object} CreatePatientDto
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} fullName
 * @property {string} phone
 * @property {string} [email]
 * @property {string} [dateOfBirth]
 * @property {string} [gender]
 * @property {string} [preferredLanguage]
 * @property {string} [idempotencyKey]
 * @property {string} [notes]
 */

/**
 * @typedef {object} PatientAppointmentsQueryDto
 * @property {string} [status]
 * @property {string} [from]
 * @property {string} [to]
 * @property {number} [limit]
 */

module.exports = {
  GENDER_VALUES,
  APPOINTMENT_STATUS_VALUES,
};
