/**
 * Maps Prisma Patient / Appointment records to API response shapes.
 */

function toDateOnly(value) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function toIsoDateTime(value) {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPatientResponse(patient) {
  if (!patient) {
    return null;
  }

  return {
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    fullName: patient.fullName,
    phone: patient.phone,
    phoneE164: patient.phoneE164,
    email: patient.email ?? null,
    dateOfBirth: toDateOnly(patient.dateOfBirth),
    gender: patient.gender,
    preferredLanguage: patient.preferredLanguage ?? null,
    isReturning: Boolean(patient.isReturning),
    notes: patient.notes ?? null,
    clinikoId: patient.clinikoId ?? null,
    createdAt: toIsoDateTime(patient.createdAt),
    updatedAt: toIsoDateTime(patient.updatedAt),
  };
}

function toPatientCreateResponse(patient) {
  if (!patient) {
    return null;
  }

  return {
    id: patient.id,
    fullName: patient.fullName,
    phoneE164: patient.phoneE164,
    isReturning: Boolean(patient.isReturning),
    createdAt: toIsoDateTime(patient.createdAt),
  };
}

function toAppointmentSummary(appointment) {
  if (!appointment) {
    return null;
  }

  return {
    appointmentId: appointment.id,
    id: appointment.id,
    status: appointment.status,
    source: appointment.source,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctor?.displayName ?? null,
    branchId: appointment.branchId,
    branchName: appointment.branch?.name ?? null,
    departmentId: appointment.departmentId ?? null,
    slotId: appointment.slotId,
    startsAt: toIsoDateTime(appointment.startsAt),
    endsAt: toIsoDateTime(appointment.endsAt),
    visitReason: appointment.visitReason ?? null,
    createdAt: toIsoDateTime(appointment.createdAt),
    updatedAt: toIsoDateTime(appointment.updatedAt),
  };
}

module.exports = {
  toPatientResponse,
  toPatientCreateResponse,
  toAppointmentSummary,
};
