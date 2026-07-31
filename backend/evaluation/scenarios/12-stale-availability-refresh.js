const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'stale-availability-refresh',
  name: 'Stale Availability Refresh',
  language: 'en',
  category: 'availability',
  description: 'Offered slot becomes stale; agent refreshes availability and books a fresh slot.',
  tags: ['availability', 'stale', 'retry'],
  expectedMaxTurns: 5,
  expectedMaxToolCalls: 8,
  turns: [
    turn({
      user: 'Show me slots for tomorrow at Andheri.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          {
            branchId: 'branch_andheri',
            from: 'ISO_TOMORROW_START',
            to: 'ISO_TOMORROW_END',
          },
          { ok: true, slots: [{ slotId: 'slot_stale_1' }, { slotId: 'slot_fresh_1' }] },
        ),
      ],
    }),
    turn({
      user: 'Take the first one. Phone 9555666777, name Meera Joshi.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919555666777' }, { ok: true, found: false }),
        tool(
          'registerPatient',
          {
            firstName: 'Meera',
            lastName: 'Joshi',
            fullName: 'Meera Joshi',
            phone: '+919555666777',
          },
          { ok: true, patientId: 'pat_stale_1' },
        ),
        tool('holdSlot', { slotId: 'slot_stale_1', callSessionId: 'sess_stale_1' }, {
          ok: false,
          error: { code: 'SLOT_UNAVAILABLE', message: 'Slot no longer available', retryable: true },
        }),
      ],
      expectedBackendResponses: [{ error: { code: 'SLOT_UNAVAILABLE' } }],
    }),
    turn({
      user: 'Okay, refresh and book the next available.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          {
            branchId: 'branch_andheri',
            from: 'ISO_TOMORROW_START',
            to: 'ISO_TOMORROW_END',
          },
          { ok: true, slots: [{ slotId: 'slot_fresh_1' }] },
        ),
        tool('holdSlot', { slotId: 'slot_fresh_1', callSessionId: 'sess_stale_1' }, {
          ok: true,
          slotId: 'slot_fresh_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_stale_1', slotId: 'slot_fresh_1', callSessionId: 'sess_stale_1' },
          { ok: true, appointment: { appointmentId: 'appt_stale_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'en',
    summary: 'Stale slot rejected; refreshed availability and booked alternate slot.',
  }),
};
