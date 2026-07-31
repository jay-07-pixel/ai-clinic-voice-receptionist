const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'earliest-slot-across-branches',
  name: 'Earliest Slot Across Branches',
  language: 'en',
  category: 'availability',
  description: 'Find earliest available slot across multiple branches and book it.',
  tags: ['availability', 'multi-branch', 'earliest'],
  expectedMaxTurns: 4,
  expectedMaxToolCalls: 6,
  turns: [
    turn({
      user: 'I need the earliest possible appointment at any of your Mumbai branches.',
      expectedToolCalls: [
        tool(
          'earliestAvailability',
          {
            branchIds: ['branch_andheri', 'branch_bandra', 'branch_powai'],
            from: 'ISO_NOW',
            to: 'ISO_PLUS_7D',
          },
          {
            ok: true,
            found: true,
            slot: {
              slotId: 'slot_powai_earliest',
              branchId: 'branch_powai',
              startsAt: 'ISO_EARLIEST',
            },
          },
        ),
      ],
      expectedBackendResponses: [{ found: true, slot: { branchId: 'branch_powai' } }],
    }),
    turn({
      user: 'My number is 9000011111 and I am Neha Kapoor.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919000011111' }, { ok: true, found: false }),
        tool(
          'registerPatient',
          {
            firstName: 'Neha',
            lastName: 'Kapoor',
            fullName: 'Neha Kapoor',
            phone: '+919000011111',
          },
          { ok: true, patientId: 'pat_earliest_1' },
        ),
      ],
    }),
    turn({
      user: 'Book that earliest Powai slot.',
      expectedToolCalls: [
        tool('holdSlot', { slotId: 'slot_powai_earliest', callSessionId: 'sess_earliest_1' }, {
          ok: true,
          slotId: 'slot_powai_earliest',
        }),
        tool(
          'bookAppointment',
          {
            patientId: 'pat_earliest_1',
            slotId: 'slot_powai_earliest',
            callSessionId: 'sess_earliest_1',
          },
          { ok: true, appointment: { appointmentId: 'appt_earliest_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'en',
    summary: 'Earliest cross-branch slot at Powai booked.',
  }),
};
