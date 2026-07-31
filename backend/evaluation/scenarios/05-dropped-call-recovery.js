const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'dropped-call-recovery',
  name: 'Dropped Call Recovery',
  language: 'en',
  category: 'recovery',
  description: 'Caller redials after drop; session resumes with preserved context and slot hold.',
  tags: ['recovery', 'resume', 'hold'],
  expectedMaxTurns: 4,
  expectedMaxToolCalls: 4,
  turns: [
    turn({
      user: '[SYSTEM] Prior call dropped during booking confirmation.',
      expectedToolCalls: [
        tool(
          'saveConversation',
          {
            callSessionId: 'sess_drop_1',
            currentIntent: 'book_appointment',
            currentStep: 'confirm_slot',
            conversationState: { selectedSlotId: 'slot_drop_1', patientId: 'pat_drop_1' },
          },
          { ok: true, savedAt: 'ISO_NOW' },
        ),
      ],
    }),
    turn({
      user: 'Sorry, the call dropped. I am calling back.',
      expectedToolCalls: [
        tool(
          'resumeCall',
          {
            callSessionId: 'sess_drop_1',
            recoveryToken: 'rcv_eval_token',
            externalCallId: 'retell_new_1',
          },
          {
            ok: true,
            recovered: true,
            callSessionId: 'sess_drop_1',
            currentIntent: 'book_appointment',
            currentStep: 'confirm_slot',
          },
        ),
      ],
      expectedBackendResponses: [{ recovered: true, currentStep: 'confirm_slot' }],
    }),
    turn({
      user: 'Yes, please finish the booking for the same slot.',
      expectedToolCalls: [
        tool(
          'bookAppointment',
          {
            patientId: 'pat_drop_1',
            slotId: 'slot_drop_1',
            callSessionId: 'sess_drop_1',
          },
          { ok: true, appointment: { appointmentId: 'appt_drop_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    sessionResumed: true,
    language: 'en',
    summary: 'Dropped call recovered and booking completed.',
  }),
};
