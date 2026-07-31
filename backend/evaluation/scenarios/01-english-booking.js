const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'english-booking',
  name: 'English Booking',
  language: 'en',
  category: 'booking',
  description: 'New patient books an appointment in English end-to-end.',
  tags: ['booking', 'english', 'happy-path'],
  expectedMaxTurns: 8,
  expectedMaxToolCalls: 6,
  turns: [
    turn({
      user: 'Hi, I need to book a doctor appointment for tomorrow.',
      expectedToolCalls: [],
      expectedBackendResponses: [],
      notes: 'Intent capture only',
    }),
    turn({
      user: 'My phone number is 9876543210.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919876543210' }, { ok: true, found: false }),
      ],
      expectedBackendResponses: [{ found: false }],
    }),
    turn({
      user: 'My name is Rahul Sharma.',
      expectedToolCalls: [
        tool(
          'registerPatient',
          {
            firstName: 'Rahul',
            lastName: 'Sharma',
            fullName: 'Rahul Sharma',
            phone: '+919876543210',
          },
          { ok: true, patientId: 'pat_eval_1' },
        ),
      ],
      expectedBackendResponses: [{ patientId: 'pat_eval_1' }],
    }),
    turn({
      user: 'Any general physician at Andheri branch is fine.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          { branchId: 'branch_andheri', from: 'ISO_TOMORROW_START', to: 'ISO_TOMORROW_END', limit: 5 },
          { ok: true, slots: [{ slotId: 'slot_1' }] },
        ),
      ],
      expectedBackendResponses: [{ slots: [{ slotId: 'slot_1' }] }],
    }),
    turn({
      user: 'Please book the first available slot.',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_1', callSessionId: 'sess_eval_1' }, {
          ok: true,
          slotId: 'slot_1',
          holdExpiresAt: 'ISO_HOLD',
        }),
        tool(
          'bookAppointment',
          {
            patientId: 'pat_eval_1',
            slotId: 'slot_1',
            callSessionId: 'sess_eval_1',
            visitReason: 'General checkup',
          },
          { ok: true, appointment: { appointmentId: 'appt_eval_1', status: 'CONFIRMED' } },
        ),
      ],
      expectedBackendResponses: [
        { slotId: 'slot_1' },
        { appointment: { appointmentId: 'appt_eval_1', status: 'CONFIRMED' } },
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'en',
    summary: 'Appointment booked for Rahul Sharma at Andheri.',
  }),
};
