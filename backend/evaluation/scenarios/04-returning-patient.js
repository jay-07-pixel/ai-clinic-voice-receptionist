const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'returning-patient',
  name: 'Returning Patient',
  language: 'en',
  category: 'booking',
  description: 'Known patient is identified by phone and books without re-registration.',
  tags: ['booking', 'returning', 'lookup'],
  expectedMaxTurns: 5,
  expectedMaxToolCalls: 4,
  turns: [
    turn({
      user: 'Hi, I am a returning patient. My number is 9123456780.',
      expectedToolCalls: [
        tool(
          'findPatient',
          { phone: '+919123456780' },
          {
            ok: true,
            found: true,
            patient: {
              patientId: 'pat_return_1',
              fullName: 'Sneha Iyer',
              isReturning: true,
            },
            matchConfidence: 'high',
          },
        ),
      ],
      expectedBackendResponses: [{ found: true, matchConfidence: 'high' }],
    }),
    turn({
      user: 'Book me with Dr. Mehta tomorrow afternoon.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          {
            doctorId: 'doc_mehta',
            from: 'ISO_TOMORROW_NOON',
            to: 'ISO_TOMORROW_END',
          },
          { ok: true, slots: [{ slotId: 'slot_ret_1' }] },
        ),
      ],
    }),
    turn({
      user: 'Yes, confirm that slot.',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_ret_1', callSessionId: 'sess_ret_1' }, {
          ok: true,
          slotId: 'slot_ret_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_return_1', slotId: 'slot_ret_1', callSessionId: 'sess_ret_1' },
          { ok: true, appointment: { appointmentId: 'appt_ret_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'en',
    summary: 'Returning patient Sneha Iyer booked with Dr. Mehta.',
  }),
};
