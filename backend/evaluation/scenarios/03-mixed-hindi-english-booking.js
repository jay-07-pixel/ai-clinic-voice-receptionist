const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'mixed-hindi-english-booking',
  name: 'Mixed Hindi-English Booking',
  language: 'mixed',
  category: 'booking',
  description: 'Code-switched Hindi-English booking conversation.',
  tags: ['booking', 'mixed', 'code-switch'],
  expectedMaxTurns: 7,
  expectedMaxToolCalls: 5,
  turns: [
    turn({
      user: 'Hello ji, mujhe appointment book karni hai.',
      expectedToolCalls: [],
    }),
    turn({
      user: 'Phone number hai +91 9988776655.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919988776655' }, { ok: true, found: false }),
      ],
    }),
    turn({
      user: 'Mera naam Amit Patel hai.',
      expectedToolCalls: [
        tool(
          'registerPatient',
          {
            firstName: 'Amit',
            lastName: 'Patel',
            fullName: 'Amit Patel',
            phone: '+919988776655',
          },
          { ok: true, patientId: 'pat_mixed_1' },
        ),
      ],
    }),
    turn({
      user: 'Bandra branch pe dermatologist chahiye, kal ke liye.',
      expectedToolCalls: [
        tool(
          'searchAvailability',
          {
            branchId: 'branch_bandra',
            departmentId: 'dept_derm',
            from: 'ISO_TOMORROW_START',
            to: 'ISO_TOMORROW_END',
          },
          { ok: true, slots: [{ slotId: 'slot_mixed_1' }] },
        ),
      ],
    }),
    turn({
      user: 'Haan book kar do please.',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_mixed_1', callSessionId: 'sess_mixed_1' }, {
          ok: true,
          slotId: 'slot_mixed_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_mixed_1', slotId: 'slot_mixed_1', callSessionId: 'sess_mixed_1' },
          { ok: true, appointment: { appointmentId: 'appt_mixed_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'mixed',
    summary: 'Amit Patel booked at Bandra dermatology.',
  }),
};
