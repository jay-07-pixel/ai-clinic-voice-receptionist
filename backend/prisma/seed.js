/**
 * Idempotent demo seed for Clinic Voice AI.
 *
 * Run:
 *   npx prisma db seed
 *   npm run db:seed
 *
 * Safe to re-run — uses upsert / find-or-create on natural keys.
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DAY = Object.freeze({
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY',
});

function atUtc(daysAhead, hour, minute = 0) {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  d.setUTCMilliseconds(0);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function dateOnlyUtc(daysAhead) {
  const d = atUtc(daysAhead, 0, 0);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function upsertByUnique(model, where, create, update) {
  return prisma[model].upsert({
    where,
    create,
    update,
  });
}

async function findOrCreateBySeedKey(model, seedKey, createData) {
  const existing = await prisma[model].findFirst({
    where: {
      metadata: {
        path: ['seedKey'],
        equals: seedKey,
      },
    },
  });

  if (existing) {
    return prisma[model].update({
      where: { id: existing.id },
      data: {
        ...createData,
        metadata: {
          ...(typeof existing.metadata === 'object' && existing.metadata
            ? existing.metadata
            : {}),
          ...(createData.metadata || {}),
          seedKey,
        },
      },
    });
  }

  return prisma[model].create({
    data: {
      ...createData,
      metadata: {
        ...(createData.metadata || {}),
        seedKey,
      },
    },
  });
}

async function upsertDepartment({ code, name, description }) {
  const existing = await prisma.department.findFirst({
    where: { code, branchId: null },
  });

  if (existing) {
    return prisma.department.update({
      where: { id: existing.id },
      data: { name, description, isActive: true },
    });
  }

  return prisma.department.create({
    data: {
      code,
      name,
      description,
      branchId: null,
      isActive: true,
    },
  });
}

async function upsertSlot({ doctorId, branchId, startsAt, endsAt, status = 'AVAILABLE' }) {
  return prisma.appointmentSlot.upsert({
    where: {
      doctorId_startsAt: {
        doctorId,
        startsAt,
      },
    },
    create: {
      doctorId,
      branchId,
      startsAt,
      endsAt,
      status,
      bufferAfterMinutes: 5,
      metadata: { seedKey: `slot_${doctorId}_${startsAt.toISOString()}` },
    },
    update: {
      branchId,
      endsAt,
      status,
      bufferAfterMinutes: 5,
      holdExpiresAt: null,
      heldBySessionId: null,
    },
  });
}

async function main() {
  console.log('Seeding Clinic Voice AI demo data...\n');

  // -------------------------------------------------------------------------
  // Clinic + settings
  // -------------------------------------------------------------------------
  const clinic = await upsertByUnique(
    'clinic',
    { code: '2CARE' },
    {
      name: '2Care Medical Clinic',
      code: '2CARE',
      phone: '+912240000001',
      email: 'hello@2care.example',
      website: 'https://2care.example',
      timezone: 'Asia/Kolkata',
      country: 'IN',
      currency: 'INR',
      isActive: true,
    },
    {
      name: '2Care Medical Clinic',
      phone: '+912240000001',
      email: 'hello@2care.example',
      website: 'https://2care.example',
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  );

  await upsertByUnique(
    'clinicSettings',
    { clinicId: clinic.id },
    {
      clinicId: clinic.id,
      appointmentBufferMinutes: 5,
      slotHoldMinutes: 3,
      cancellationWindowHours: 24,
      rescheduleWindowHours: 24,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      allowWalkIns: false,
    },
    {
      appointmentBufferMinutes: 5,
      slotHoldMinutes: 3,
      cancellationWindowHours: 24,
      rescheduleWindowHours: 24,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      allowWalkIns: false,
    },
  );

  console.log('Clinic created');

  // -------------------------------------------------------------------------
  // Branches
  // -------------------------------------------------------------------------
  const andheri = await upsertByUnique(
    'branch',
    { code: 'ANDHERI' },
    {
      clinicId: clinic.id,
      name: 'Andheri Branch',
      code: 'ANDHERI',
      addressLine1: '12 Lokhandwala Road',
      addressLine2: 'Near Infinity Mall',
      city: 'Mumbai',
      state: 'MH',
      postalCode: '400053',
      country: 'IN',
      phone: '+912240000101',
      timezone: 'Asia/Kolkata',
      isActive: true,
      metadata: { seedKey: 'branch_andheri' },
    },
    {
      clinicId: clinic.id,
      name: 'Andheri Branch',
      addressLine1: '12 Lokhandwala Road',
      city: 'Mumbai',
      state: 'MH',
      postalCode: '400053',
      phone: '+912240000101',
      isActive: true,
      deletedAt: null,
    },
  );

  const bandra = await upsertByUnique(
    'branch',
    { code: 'BANDRA' },
    {
      clinicId: clinic.id,
      name: 'Bandra Branch',
      code: 'BANDRA',
      addressLine1: '45 Linking Road',
      addressLine2: 'Bandra West',
      city: 'Mumbai',
      state: 'MH',
      postalCode: '400050',
      country: 'IN',
      phone: '+912240000202',
      timezone: 'Asia/Kolkata',
      isActive: true,
      metadata: { seedKey: 'branch_bandra' },
    },
    {
      clinicId: clinic.id,
      name: 'Bandra Branch',
      addressLine1: '45 Linking Road',
      city: 'Mumbai',
      state: 'MH',
      postalCode: '400050',
      phone: '+912240000202',
      isActive: true,
      deletedAt: null,
    },
  );

  console.log('Branches created');

  // -------------------------------------------------------------------------
  // Departments
  // -------------------------------------------------------------------------
  const generalMedicine = await upsertDepartment({
    code: 'GEN_MED',
    name: 'General Medicine',
    description: 'Primary care and general physician consultations',
  });
  const cardiology = await upsertDepartment({
    code: 'CARDIO',
    name: 'Cardiology',
    description: 'Heart and cardiovascular care',
  });
  const orthopedics = await upsertDepartment({
    code: 'ORTHO',
    name: 'Orthopedics',
    description: 'Bones, joints, and sports injuries',
  });
  const dermatology = await upsertDepartment({
    code: 'DERMA',
    name: 'Dermatology',
    description: 'Skin, hair, and cosmetic dermatology',
  });

  // -------------------------------------------------------------------------
  // Doctors
  // -------------------------------------------------------------------------
  const doctorsSpec = [
    {
      key: 'ananya',
      firstName: 'Ananya',
      lastName: 'Sharma',
      displayName: 'Dr. Ananya Sharma',
      email: 'ananya.sharma@2care.example',
      phone: '+919820000001',
      title: 'MBBS, MD (General Medicine)',
      department: generalMedicine,
      branches: [
        { branch: andheri, isPrimary: true },
        { branch: bandra, isPrimary: false },
      ],
    },
    {
      key: 'rohan',
      firstName: 'Rohan',
      lastName: 'Mehta',
      displayName: 'Dr. Rohan Mehta',
      email: 'rohan.mehta@2care.example',
      phone: '+919820000002',
      title: 'MBBS, DM (Cardiology)',
      department: cardiology,
      branches: [{ branch: bandra, isPrimary: true }],
    },
    {
      key: 'vikram',
      firstName: 'Vikram',
      lastName: 'Patel',
      displayName: 'Dr. Vikram Patel',
      email: 'vikram.patel@2care.example',
      phone: '+919820000003',
      title: 'MS (Orthopedics)',
      department: orthopedics,
      branches: [{ branch: andheri, isPrimary: true }],
    },
    {
      key: 'priya',
      firstName: 'Priya',
      lastName: 'Nair',
      displayName: 'Dr. Priya Nair',
      email: 'priya.nair@2care.example',
      phone: '+919820000004',
      title: 'MD (Dermatology)',
      department: dermatology,
      branches: [
        { branch: bandra, isPrimary: true },
        { branch: andheri, isPrimary: false },
      ],
    },
    {
      key: 'arjun',
      firstName: 'Arjun',
      lastName: 'Desai',
      displayName: 'Dr. Arjun Desai',
      email: 'arjun.desai@2care.example',
      phone: '+919820000005',
      title: 'MBBS, MD (Internal Medicine)',
      department: generalMedicine,
      branches: [{ branch: andheri, isPrimary: true }],
    },
    {
      key: 'sneha',
      firstName: 'Sneha',
      lastName: 'Iyer',
      displayName: 'Dr. Sneha Iyer',
      email: 'sneha.iyer@2care.example',
      phone: '+919820000006',
      title: 'MD, DNB (Cardiology)',
      department: cardiology,
      branches: [{ branch: andheri, isPrimary: true }],
    },
  ];

  const doctors = {};

  for (const spec of doctorsSpec) {
    const doctor = await upsertByUnique(
      'doctor',
      { email: spec.email },
      {
        firstName: spec.firstName,
        lastName: spec.lastName,
        displayName: spec.displayName,
        email: spec.email,
        phone: spec.phone,
        title: spec.title,
        isActive: true,
        metadata: { seedKey: `doctor_${spec.key}`, specialization: spec.department.name },
      },
      {
        firstName: spec.firstName,
        lastName: spec.lastName,
        displayName: spec.displayName,
        phone: spec.phone,
        title: spec.title,
        isActive: true,
        deletedAt: null,
        metadata: { seedKey: `doctor_${spec.key}`, specialization: spec.department.name },
      },
    );

    doctors[spec.key] = doctor;

    for (const assignment of spec.branches) {
      await upsertByUnique(
        'doctorBranch',
        {
          doctorId_branchId: {
            doctorId: doctor.id,
            branchId: assignment.branch.id,
          },
        },
        {
          doctorId: doctor.id,
          branchId: assignment.branch.id,
          isPrimary: assignment.isPrimary,
          isActive: true,
        },
        {
          isPrimary: assignment.isPrimary,
          isActive: true,
        },
      );
    }

    await upsertByUnique(
      'doctorDepartment',
      {
        doctorId_departmentId: {
          doctorId: doctor.id,
          departmentId: spec.department.id,
        },
      },
      {
        doctorId: doctor.id,
        departmentId: spec.department.id,
        isPrimary: true,
        isActive: true,
      },
      {
        isPrimary: true,
        isActive: true,
      },
    );
  }

  console.log('Doctors created');

  // -------------------------------------------------------------------------
  // Schedules (Mon–Sat)
  // -------------------------------------------------------------------------
  const weekdayHours = [
    { startTime: '09:00', endTime: '13:00' },
    { startTime: '14:00', endTime: '18:30' },
  ];
  const weekdays = [
    DAY.MONDAY,
    DAY.TUESDAY,
    DAY.WEDNESDAY,
    DAY.THURSDAY,
    DAY.FRIDAY,
    DAY.SATURDAY,
  ];

  for (const spec of doctorsSpec) {
    const doctor = doctors[spec.key];
    for (const assignment of spec.branches) {
      for (const dayOfWeek of weekdays) {
        for (const window of weekdayHours) {
          await upsertByUnique(
            'doctorSchedule',
            {
              doctorId_branchId_dayOfWeek_startTime_endTime: {
                doctorId: doctor.id,
                branchId: assignment.branch.id,
                dayOfWeek,
                startTime: window.startTime,
                endTime: window.endTime,
              },
            },
            {
              doctorId: doctor.id,
              branchId: assignment.branch.id,
              dayOfWeek,
              startTime: window.startTime,
              endTime: window.endTime,
              slotDuration: 30,
              isActive: true,
            },
            {
              slotDuration: 30,
              isActive: true,
            },
          );
        }
      }
    }
  }

  // Schedule exceptions (leave / shortened day)
  await upsertByUnique(
    'doctorScheduleException',
    {
      doctorId_branchId_date: {
        doctorId: doctors.ananya.id,
        branchId: andheri.id,
        date: dateOnlyUtc(3),
      },
    },
    {
      doctorId: doctors.ananya.id,
      branchId: andheri.id,
      date: dateOnlyUtc(3),
      isDayOff: true,
      reason: 'Personal leave',
    },
    {
      isDayOff: true,
      reason: 'Personal leave',
      startTime: null,
      endTime: null,
    },
  );

  await upsertByUnique(
    'doctorScheduleException',
    {
      doctorId_branchId_date: {
        doctorId: doctors.rohan.id,
        branchId: bandra.id,
        date: dateOnlyUtc(5),
      },
    },
    {
      doctorId: doctors.rohan.id,
      branchId: bandra.id,
      date: dateOnlyUtc(5),
      isDayOff: false,
      startTime: '10:00',
      endTime: '13:00',
      reason: 'Shortened clinic — conference afternoon',
    },
    {
      isDayOff: false,
      startTime: '10:00',
      endTime: '13:00',
      reason: 'Shortened clinic — conference afternoon',
    },
  );

  // -------------------------------------------------------------------------
  // Appointment slots (>= 40 AVAILABLE future slots)
  // -------------------------------------------------------------------------
  const slotBlueprints = [
    // morning
    { hour: 9, minute: 0 },
    { hour: 9, minute: 30 },
    { hour: 10, minute: 0 },
    { hour: 10, minute: 30 },
    { hour: 11, minute: 0 },
    // afternoon
    { hour: 14, minute: 0 },
    { hour: 14, minute: 30 },
    { hour: 15, minute: 0 },
    { hour: 15, minute: 30 },
    // evening
    { hour: 17, minute: 0 },
    { hour: 17, minute: 30 },
    { hour: 18, minute: 0 },
  ];

  const doctorBranchPairs = [
    { doctor: doctors.ananya, branch: andheri },
    { doctor: doctors.arjun, branch: andheri },
    { doctor: doctors.vikram, branch: andheri },
    { doctor: doctors.sneha, branch: andheri },
    { doctor: doctors.rohan, branch: bandra },
    { doctor: doctors.priya, branch: bandra },
  ];

  /** @type {Array<{ doctorId: string, branchId: string, startsAt: Date, endsAt: Date, slot: any }>} */
  const createdSlots = [];

  // Days 1..5 ahead × selected doctors × selected times → well over 40 slots
  for (let dayOffset = 1; dayOffset <= 5; dayOffset += 1) {
    for (const pair of doctorBranchPairs) {
      // Use a subset of blueprints per day to keep variety but still > 40 total
      const timesForDay = slotBlueprints.filter((_, idx) => (dayOffset + idx) % 2 === 0).slice(0, 4);
      // Ensure denser inventory: always take first 3 morning/afternoon/evening picks
      const ensured = [
        slotBlueprints[0],
        slotBlueprints[5],
        slotBlueprints[9],
        ...timesForDay,
      ];
      const uniqueTimes = [];
      const seen = new Set();
      for (const t of ensured) {
        const key = `${t.hour}:${t.minute}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueTimes.push(t);
        }
      }

      for (const t of uniqueTimes) {
        const startsAt = atUtc(dayOffset, t.hour, t.minute);
        const endsAt = addMinutes(startsAt, 30);
        const slot = await upsertSlot({
          doctorId: pair.doctor.id,
          branchId: pair.branch.id,
          startsAt,
          endsAt,
          status: 'AVAILABLE',
        });
        createdSlots.push({
          doctorId: pair.doctor.id,
          branchId: pair.branch.id,
          startsAt,
          endsAt,
          slot,
        });
      }
    }
  }

  // Dedicated past + near-future slots for appointment history / upcoming booking
  const pastStarts = atUtc(-7, 10, 0);
  const pastEnds = addMinutes(pastStarts, 30);
  const pastSlot = await upsertSlot({
    doctorId: doctors.ananya.id,
    branchId: andheri.id,
    startsAt: pastStarts,
    endsAt: pastEnds,
    status: 'BOOKED',
  });

  const upcomingStarts = atUtc(2, 11, 30);
  const upcomingEnds = addMinutes(upcomingStarts, 30);
  const upcomingSlot = await upsertSlot({
    doctorId: doctors.ananya.id,
    branchId: andheri.id,
    startsAt: upcomingStarts,
    endsAt: upcomingEnds,
    status: 'BOOKED',
  });

  const availableCount = await prisma.appointmentSlot.count({
    where: { status: 'AVAILABLE' },
  });

  console.log('Slots created');

  // -------------------------------------------------------------------------
  // Patients
  // -------------------------------------------------------------------------
  const rahul = await upsertByUnique(
    'patient',
    { phoneE164: '+919876543210' },
    {
      firstName: 'Rahul',
      lastName: 'Kapoor',
      fullName: 'Rahul Kapoor',
      phone: '9876543210',
      phoneE164: '+919876543210',
      email: 'rahul.kapoor@example.com',
      dateOfBirth: new Date('1990-05-14'),
      gender: 'MALE',
      preferredLanguage: 'en',
      isReturning: true,
      notes: 'Seed returning patient',
      metadata: { seedKey: 'patient_rahul' },
    },
    {
      firstName: 'Rahul',
      lastName: 'Kapoor',
      fullName: 'Rahul Kapoor',
      phone: '9876543210',
      email: 'rahul.kapoor@example.com',
      isReturning: true,
      deletedAt: null,
      preferredLanguage: 'en',
    },
  );

  const meera = await upsertByUnique(
    'patient',
    { phoneE164: '+919811122233' },
    {
      firstName: 'Meera',
      lastName: 'Joshi',
      fullName: 'Meera Joshi',
      phone: '9811122233',
      phoneE164: '+919811122233',
      email: 'meera.joshi@example.com',
      dateOfBirth: new Date('1994-11-02'),
      gender: 'FEMALE',
      preferredLanguage: 'en',
      isReturning: false,
      metadata: { seedKey: 'patient_meera' },
    },
    {
      firstName: 'Meera',
      lastName: 'Joshi',
      fullName: 'Meera Joshi',
      phone: '9811122233',
      isReturning: false,
      deletedAt: null,
    },
  );

  const priyaPatient = await upsertByUnique(
    'patient',
    { phoneE164: '+919900011122' },
    {
      firstName: 'Priya',
      lastName: 'Verma',
      fullName: 'Priya Verma',
      phone: '9900011122',
      phoneE164: '+919900011122',
      email: 'priya.verma@example.com',
      dateOfBirth: new Date('1988-08-21'),
      gender: 'FEMALE',
      preferredLanguage: 'hi',
      isReturning: false,
      metadata: { seedKey: 'patient_priya' },
    },
    {
      firstName: 'Priya',
      lastName: 'Verma',
      fullName: 'Priya Verma',
      phone: '9900011122',
      preferredLanguage: 'hi',
      isReturning: false,
      deletedAt: null,
    },
  );

  console.log('Patients created');

  // -------------------------------------------------------------------------
  // Appointments (2) — returning patient history + upcoming
  // -------------------------------------------------------------------------
  const completedAppt = await upsertByUnique(
    'appointment',
    { idempotencyKey: 'seed_appt_rahul_completed' },
    {
      patientId: rahul.id,
      doctorId: doctors.ananya.id,
      branchId: andheri.id,
      departmentId: generalMedicine.id,
      slotId: pastSlot.id,
      status: 'COMPLETED',
      source: 'VOICE_AI',
      startsAt: pastStarts,
      endsAt: pastEnds,
      visitReason: 'Fever and general checkup',
      notes: 'Seed completed visit',
      idempotencyKey: 'seed_appt_rahul_completed',
      metadata: { seedKey: 'appt_rahul_completed' },
    },
    {
      status: 'COMPLETED',
      visitReason: 'Fever and general checkup',
      notes: 'Seed completed visit',
      deletedAt: null,
      startsAt: pastStarts,
      endsAt: pastEnds,
      doctorId: doctors.ananya.id,
      branchId: andheri.id,
      departmentId: generalMedicine.id,
      slotId: pastSlot.id,
      patientId: rahul.id,
    },
  );

  const upcomingAppt = await upsertByUnique(
    'appointment',
    { idempotencyKey: 'seed_appt_rahul_upcoming' },
    {
      patientId: rahul.id,
      doctorId: doctors.ananya.id,
      branchId: andheri.id,
      departmentId: generalMedicine.id,
      slotId: upcomingSlot.id,
      status: 'CONFIRMED',
      source: 'MANUAL',
      startsAt: upcomingStarts,
      endsAt: upcomingEnds,
      visitReason: 'Follow-up consultation',
      notes: 'Seed upcoming appointment',
      idempotencyKey: 'seed_appt_rahul_upcoming',
      metadata: { seedKey: 'appt_rahul_upcoming' },
    },
    {
      status: 'CONFIRMED',
      visitReason: 'Follow-up consultation',
      notes: 'Seed upcoming appointment',
      deletedAt: null,
      startsAt: upcomingStarts,
      endsAt: upcomingEnds,
      doctorId: doctors.ananya.id,
      branchId: andheri.id,
      departmentId: generalMedicine.id,
      slotId: upcomingSlot.id,
      patientId: rahul.id,
    },
  );

  console.log('Appointments created');

  // -------------------------------------------------------------------------
  // Callback request
  // -------------------------------------------------------------------------
  await findOrCreateBySeedKey('callbackRequest', 'seed_callback_missed_meera', {
    patientId: meera.id,
    branchId: bandra.id,
    phone: '9811122233',
    phoneE164: '+919811122233',
    reason: 'DROPPED_CALL',
    status: 'PENDING',
    priority: 10,
    attemptCount: 0,
    maxAttempts: 3,
    nextAttemptAt: atUtc(0, 12, 0),
    notes: 'Missed call while booking dermatology consult',
    metadata: {
      seedKey: 'seed_callback_missed_meera',
      source: 'missed_call',
    },
  });

  // -------------------------------------------------------------------------
  // Audit logs
  // -------------------------------------------------------------------------
  const existingAudit = await prisma.auditLog.findFirst({
    where: {
      metadata: { path: ['seedKey'], equals: 'seed_audit_clinic_create' },
    },
  });

  if (!existingAudit) {
    await prisma.auditLog.create({
      data: {
        actorType: 'SYSTEM',
        actorId: 'seed',
        action: 'CREATE',
        entityType: 'Clinic',
        entityId: clinic.id,
        after: { id: clinic.id, name: clinic.name, code: clinic.code },
        metadata: { seedKey: 'seed_audit_clinic_create' },
      },
    });
  }

  const existingBookAudit = await prisma.auditLog.findFirst({
    where: {
      metadata: { path: ['seedKey'], equals: 'seed_audit_appt_book' },
    },
  });

  if (!existingBookAudit) {
    await prisma.auditLog.create({
      data: {
        actorType: 'VOICE_AI',
        actorId: 'seed',
        action: 'BOOK',
        entityType: 'Appointment',
        entityId: upcomingAppt.id,
        after: {
          id: upcomingAppt.id,
          status: upcomingAppt.status,
          patientId: rahul.id,
        },
        metadata: { seedKey: 'seed_audit_appt_book' },
      },
    });
  }

  // -------------------------------------------------------------------------
  // Cliniko sync examples
  // -------------------------------------------------------------------------
  await upsertByUnique(
    'clinikoSync',
    {
      entityType_localId: {
        entityType: 'BRANCH',
        localId: andheri.id,
      },
    },
    {
      entityType: 'BRANCH',
      localId: andheri.id,
      clinikoId: 'cliniko_branch_andheri',
      direction: 'BIDIRECTIONAL',
      status: 'SUCCESS',
      lastSyncedAt: new Date(),
      lastAttemptAt: new Date(),
      attemptCount: 1,
      payloadHash: 'seed_hash_branch_andheri',
      metadata: { seedKey: 'cliniko_sync_branch_andheri' },
    },
    {
      clinikoId: 'cliniko_branch_andheri',
      status: 'SUCCESS',
      direction: 'BIDIRECTIONAL',
      lastSyncedAt: new Date(),
      attemptCount: 1,
      errorMessage: null,
    },
  );

  await upsertByUnique(
    'clinikoSync',
    {
      entityType_localId: {
        entityType: 'DOCTOR',
        localId: doctors.ananya.id,
      },
    },
    {
      entityType: 'DOCTOR',
      localId: doctors.ananya.id,
      clinikoId: 'cliniko_doctor_ananya',
      direction: 'OUTBOUND',
      status: 'PENDING',
      attemptCount: 0,
      metadata: { seedKey: 'cliniko_sync_doctor_ananya' },
    },
    {
      clinikoId: 'cliniko_doctor_ananya',
      status: 'PENDING',
      direction: 'OUTBOUND',
      attemptCount: 0,
      errorMessage: null,
    },
  );

  await upsertByUnique(
    'clinikoSync',
    {
      entityType_localId: {
        entityType: 'APPOINTMENT',
        localId: completedAppt.id,
      },
    },
    {
      entityType: 'APPOINTMENT',
      localId: completedAppt.id,
      clinikoId: 'cliniko_appt_rahul_completed',
      direction: 'OUTBOUND',
      status: 'SUCCESS',
      lastSyncedAt: new Date(),
      lastAttemptAt: new Date(),
      attemptCount: 1,
      metadata: { seedKey: 'cliniko_sync_appt_completed' },
    },
    {
      clinikoId: 'cliniko_appt_rahul_completed',
      status: 'SUCCESS',
      attemptCount: 1,
      errorMessage: null,
      lastSyncedAt: new Date(),
    },
  );

  console.log('Seed completed successfully');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
