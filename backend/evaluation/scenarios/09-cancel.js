const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'cancel',
  name: 'Cancel',
  language: 'en',
  category: 'lifecycle',
  description: 'Patient cancels an existing confirmed appointment.',
  tags: ['cancel', 'lifecycle'],
  expectedMaxTurns: 3,
  expectedMaxToolCalls: 3,
  turns: [
    turn({
      user: 'Please cancel my appointment. My phone is 9222333444.',
      expectedToolCalls: [
        tool(
          'findPatient',
          { phone: '+919222333444' },
          {
            ok: true,
            found: true,
            patient: { patientId: 'pat_cancel_1', fullName: 'Ananya Rao', isReturning: true },
          },
        ),
        tool(
          'listPatientAppointments',
          { patientId: 'pat_cancel_1' },
          {
            ok: true,
            appointments: [{ id: 'appt_cancel_1', status: 'CONFIRMED' }],
          },
        ),
      ],
    }),
    turn({
      user: 'Yes, cancel the upcoming one. I am traveling.',
      expectedToolCalls: [
        tool(
          'cancelAppointment',
          {
            appointmentId: 'appt_cancel_1',
            patientId: 'pat_cancel_1',
            cancellationReason: 'Traveling',
            callSessionId: 'sess_cancel_1',
          },
          {
            ok: true,
            appointmentId: 'appt_cancel_1',
            status: 'CANCELLED',
          },
        ),
      ],
      expectedBackendResponses: [{ status: 'CANCELLED' }],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentCancelled: true,
    language: 'en',
    summary: 'Appointment cancelled successfully.',
  }),
};
