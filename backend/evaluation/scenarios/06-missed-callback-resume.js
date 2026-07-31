const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'missed-callback-resume',
  name: 'Missed Callback Resume',
  language: 'en',
  category: 'callback',
  description: 'Missed call creates callback; outbound resume continues prior booking intent.',
  tags: ['callback', 'resume', 'outbound'],
  expectedMaxTurns: 5,
  expectedMaxToolCalls: 5,
  turns: [
    turn({
      user: '[SYSTEM] Inbound call missed / dropped without booking.',
      expectedToolCalls: [
        tool(
          'createCallback',
          {
            phone: '+919700011122',
            callSessionId: 'sess_cb_1',
            source: 'missed_call',
            reason: 'DROPPED_CALL',
          },
          { ok: true, callbackId: 'cb_eval_1', status: 'PENDING' },
        ),
      ],
      expectedBackendResponses: [{ callbackId: 'cb_eval_1', status: 'PENDING' }],
    }),
    turn({
      user: '[SYSTEM] Outbound callback connects to patient.',
      expectedToolCalls: [
        tool(
          'resumeCall',
          { callSessionId: 'sess_cb_1', externalCallId: 'retell_outbound_1' },
          {
            ok: true,
            recovered: true,
            callSessionId: 'sess_cb_1',
            currentIntent: 'book_appointment',
          },
        ),
      ],
    }),
    turn({
      user: 'Yes, I still want tomorrow morning.',
      expectedToolCalls: [
        tool(
          'earliestAvailability',
          { from: 'ISO_TOMORROW_START', to: 'ISO_TOMORROW_NOON' },
          { ok: true, found: true, slot: { slotId: 'slot_cb_1' } },
        ),
        tool('holdSlot', { slotId: 'slot_cb_1', callSessionId: 'sess_cb_1' }, {
          ok: true,
          slotId: 'slot_cb_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_cb_1', slotId: 'slot_cb_1', callSessionId: 'sess_cb_1' },
          { ok: true, appointment: { appointmentId: 'appt_cb_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    callbackCreated: true,
    sessionResumed: true,
    language: 'en',
    summary: 'Missed callback resumed and appointment booked.',
  }),
};
