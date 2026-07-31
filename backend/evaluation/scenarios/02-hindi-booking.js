const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'hindi-booking',
  name: 'Hindi Booking',
  language: 'hi',
  category: 'booking',
  description: 'New patient books an appointment using Hindi utterances.',
  tags: ['booking', 'hindi', 'i18n'],
  expectedMaxTurns: 8,
  expectedMaxToolCalls: 6,
  turns: [
    turn({
      user: 'नमस्ते, मुझे डॉक्टर से मिलना है।',
      expectedToolCalls: [],
    }),
    turn({
      user: 'मेरा नंबर नौ आठ सात छह पांच चार तीन दो एक शून्य है।',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919876543210' }, { ok: true, found: false }),
      ],
      expectedBackendResponses: [{ found: false }],
    }),
    turn({
      user: 'मेरा नाम प्रिया वर्मा है।',
      expectedToolCalls: [
        tool(
          'registerPatient',
          {
            firstName: 'Priya',
            lastName: 'Verma',
            fullName: 'Priya Verma',
            phone: '+919876543210',
            preferredLanguage: 'hi',
          },
          { ok: true, patientId: 'pat_eval_hi_1' },
        ),
      ],
    }),
    turn({
      user: 'कल सुबह का सबसे जल्दी स्लॉट चाहिए।',
      expectedToolCalls: [
        tool(
          'earliestAvailability',
          { from: 'ISO_TOMORROW_START', to: 'ISO_TOMORROW_END' },
          { ok: true, found: true, slot: { slotId: 'slot_hi_1' } },
        ),
      ],
    }),
    turn({
      user: 'हाँ, बुक कर दीजिए।',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_hi_1', callSessionId: 'sess_hi_1' }, {
          ok: true,
          slotId: 'slot_hi_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_eval_hi_1', slotId: 'slot_hi_1', callSessionId: 'sess_hi_1' },
          { ok: true, appointment: { appointmentId: 'appt_hi_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'hi',
    summary: 'प्रिया वर्मा के लिए अपॉइंटमेंट बुक हुई।',
  }),
};
