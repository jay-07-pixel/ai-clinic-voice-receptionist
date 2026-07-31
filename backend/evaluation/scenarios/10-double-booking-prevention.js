const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'double-booking-prevention',
  name: 'Double Booking Prevention',
  language: 'en',
  category: 'safety',
  description: 'Second concurrent booking attempt on the same slot must fail safely.',
  tags: ['safety', 'concurrency', 'slot-unavailable'],
  expectedMaxTurns: 4,
  expectedMaxToolCalls: 7,
  turns: [
    turn({
      user: 'Book slot slot_busy_1 for me. Phone 9333444555, name Vikram Shah.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919333444555' }, { ok: true, found: false }),
        tool(
          'registerPatient',
          {
            firstName: 'Vikram',
            lastName: 'Shah',
            fullName: 'Vikram Shah',
            phone: '+919333444555',
          },
          { ok: true, patientId: 'pat_db_1' },
        ),
        tool('holdSlot', { slotId: 'slot_busy_1', callSessionId: 'sess_db_1' }, {
          ok: true,
          slotId: 'slot_busy_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_db_1', slotId: 'slot_busy_1', callSessionId: 'sess_db_1' },
          { ok: true, appointment: { appointmentId: 'appt_db_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
    turn({
      user: '[CONCURRENT] Another caller tries the same slot.',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_busy_1', callSessionId: 'sess_db_2' }, {
          ok: false,
          error: { code: 'SLOT_UNAVAILABLE', retryable: true },
        }),
      ],
      expectedBackendResponses: [{ error: { code: 'SLOT_UNAVAILABLE' } }],
      notes: 'Must not create a second booking',
    }),
    turn({
      user: 'Okay, show me another time.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          { from: 'ISO_NOW', to: 'ISO_PLUS_3D' },
          { ok: true, slots: [{ slotId: 'slot_alt_1' }] },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    doubleBookingBlocked: true,
    language: 'en',
    summary: 'First booking succeeded; duplicate slot hold blocked.',
  }),
};
