const englishBooking = require('./01-english-booking');
const hindiBooking = require('./02-hindi-booking');
const mixedBooking = require('./03-mixed-hindi-english-booking');
const returningPatient = require('./04-returning-patient');
const droppedCallRecovery = require('./05-dropped-call-recovery');
const missedCallbackResume = require('./06-missed-callback-resume');
const earliestAcrossBranches = require('./07-earliest-slot-across-branches');
const reschedule = require('./08-reschedule');
const cancel = require('./09-cancel');
const doubleBooking = require('./10-double-booking-prevention');
const branchDoctorSearch = require('./11-branch-specific-doctor-search');
const staleAvailability = require('./12-stale-availability-refresh');

const scenarios = Object.freeze([
  englishBooking,
  hindiBooking,
  mixedBooking,
  returningPatient,
  droppedCallRecovery,
  missedCallbackResume,
  earliestAcrossBranches,
  reschedule,
  cancel,
  doubleBooking,
  branchDoctorSearch,
  staleAvailability,
]);

function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id) || null;
}

module.exports = {
  scenarios,
  getScenarioById,
};
