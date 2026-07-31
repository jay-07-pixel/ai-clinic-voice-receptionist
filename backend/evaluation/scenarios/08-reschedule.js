const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'reschedule',
  name: 'Reschedule',
  language: 'en',
  category: 'lifecycle',
  description: 'Existing appointment is moved to a new slot.',
  tags: ['reschedule', 'lifecycle'],
  expectedMaxTurns: 5,
  expectedMaxToolCalls: 5,
  turns: [
    turn({
      user: 'I need to reschedule my appointment. Phone 9111222333.',
      expectedToolCalls: [
        tool(
          'findPatient',
          { phone: '+919111222333' },
          {
            ok: true,
            found: true,
            patient: { patientId: 'pat_rs_1', fullName: 'Karan Malhotra', isReturning: true },
          },
        ),
        tool(
          'listPatientAppointments',
          { patientId: 'pat_rs_1' },
          {
            ok: true,
            appointments: [{ id: 'appt_old_1', status: 'CONFIRMED', startsAt: 'ISO_OLD' }],
          },
        ),
      ],
    }),
    turn({
      user: 'Move it to Friday morning instead.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          { from: 'ISO_FRIDAY_START', to: 'ISO_FRIDAY_NOON' },
          { ok: true, slots: [{ slotId: 'slot_new_1' }] },
        ),
        tool('holdSlot', { slotId: 'slot_new_1', callSessionId: 'sess_rs_1' }, {
          ok: true,
          slotId: 'slot_new_1',
        }),
        tool(
          'rescheduleAppointment',
          {
            appointmentId: 'appt_old_1',
            newSlotId: 'slot_new_1',
            callSessionId: 'sess_rs_1',
          },
          {
            ok: true,
            appointment: { appointmentId: 'appt_new_1', status: 'CONFIRMED' },
          },
        ),
      ],
      expectedBackendResponses: [
        { slots: [{ slotId: 'slot_new_1' }] },
        { slotId: 'slot_new_1' },
        { appointment: { appointmentId: 'appt_new_1' } },
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentRescheduled: true,
    language: 'en',
    summary: 'Appointment rescheduled to Friday morning.',
  }),
};
