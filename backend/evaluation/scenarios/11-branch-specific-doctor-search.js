const { turn, tool, outcome } = require('./_helpers');

module.exports = {
  id: 'branch-specific-doctor-search',
  name: 'Branch-specific Doctor Search',
  language: 'en',
  category: 'discovery',
  description: 'List doctors for a specific branch, then book with a chosen doctor.',
  tags: ['branch', 'doctor', 'search'],
  expectedMaxTurns: 5,
  expectedMaxToolCalls: 8,
  turns: [
    turn({
      user: 'Which doctors are available at your Powai branch?',
      expectedToolCalls: [
        tool('getBranch', { branchId: 'branch_powai' }, {
          ok: true,
          branch: { id: 'branch_powai', name: 'Powai' },
        }),
        tool(
          'listDoctors',
          { branchId: 'branch_powai' },
          {
            ok: true,
            doctors: [
              { id: 'doc_powai_1', displayName: 'Dr. Nair' },
              { id: 'doc_powai_2', displayName: 'Dr. Sen' },
            ],
          },
        ),
      ],
    }),
    turn({
      user: 'Book with Dr. Nair tomorrow. My phone is 9444555666, I am Rohan Desai.',
      expectedToolCalls: [
        tool('findPatient', { phone: '+919444555666' }, { ok: true, found: false }),
        tool(
          'registerPatient',
          {
            firstName: 'Rohan',
            lastName: 'Desai',
            fullName: 'Rohan Desai',
            phone: '+919444555666',
          },
          { ok: true, patientId: 'pat_br_1' },
        ),
        tool(
          'searchAvailability',
          {
            branchId: 'branch_powai',
            doctorId: 'doc_powai_1',
            from: 'ISO_TOMORROW_START',
            to: 'ISO_TOMORROW_END',
          },
          { ok: true, slots: [{ slotId: 'slot_br_1' }] },
        ),
        tool('holdSlot', { slotId: 'slot_br_1', callSessionId: 'sess_br_1' }, {
          ok: true,
          slotId: 'slot_br_1',
        }),
        tool(
          'bookAppointment',
          { patientId: 'pat_br_1', slotId: 'slot_br_1', callSessionId: 'sess_br_1' },
          { ok: true, appointment: { appointmentId: 'appt_br_1', status: 'CONFIRMED' } },
        ),
      ],
    }),
  ],
  expectedFinalOutcome: outcome({
    status: 'SUCCESS',
    appointmentBooked: true,
    language: 'en',
    summary: 'Booked Dr. Nair at Powai after branch doctor search.',
  }),
};
