/**
 * Maps Appointment records to API response shapes.
 */

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

function toAppointmentResponse(appointment) {
  if (!appointment) {
    return null;
  }

  return {
    id: appointment.id,
    status: appointment.status,
    source: appointment.source,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    branchId: appointment.branchId,
    departmentId: appointment.departmentId ?? null,
    slotId: appointment.slotId,
    startsAt: toIsoDateTime(appointment.startsAt),
    endsAt: toIsoDateTime(appointment.endsAt),
    visitReason: appointment.visitReason ?? null,
    cancellationReason: appointment.cancellationReason ?? null,
    cancelledAt: toIsoDateTime(appointment.cancelledAt),
    rescheduledFromId: appointment.rescheduledFromId ?? null,
    callSessionId: appointment.callSessionId ?? null,
    clinikoId: appointment.clinikoId ?? null,
    createdAt: toIsoDateTime(appointment.createdAt),
    updatedAt: toIsoDateTime(appointment.updatedAt),
  };
}

function toAppointmentBookResponse(appointment) {
  if (!appointment) {
    return null;
  }

  return {
    id: appointment.id,
    status: appointment.status,
    patientId: appointment.patientId,
    doctorId: appointment.doctorId,
    branchId: appointment.branchId,
    slotId: appointment.slotId,
    startsAt: toIsoDateTime(appointment.startsAt),
    endsAt: toIsoDateTime(appointment.endsAt),
    visitReason: appointment.visitReason ?? null,
    clinikoId: appointment.clinikoId ?? null,
  };
}

function toAppointmentCancelResponse(appointment) {
  if (!appointment) {
    return null;
  }

  return {
    id: appointment.id,
    status: appointment.status,
    cancelledAt: toIsoDateTime(appointment.cancelledAt),
    cancellationReason: appointment.cancellationReason ?? null,
  };
}

function toPreviousAppointmentSummary(appointment) {
  if (!appointment) {
    return null;
  }

  return {
    id: appointment.id,
    status: appointment.status,
  };
}

function toAppointmentSelectResponse(appointment) {
  if (!appointment) {
    return null;
  }

  const doctorName =
    appointment.doctor?.displayName ||
    [appointment.doctor?.firstName, appointment.doctor?.lastName].filter(Boolean).join(' ') ||
    null;

  return {
    appointmentId: appointment.id,
    slotId: appointment.slotId,
    doctorId: appointment.doctorId,
    branchId: appointment.branchId,
    doctorName,
    branchName: appointment.branch?.name ?? null,
    startsAt: toIsoDateTime(appointment.startsAt),
    status: appointment.status,
  };
}

module.exports = {
  toAppointmentResponse,
  toAppointmentBookResponse,
  toAppointmentCancelResponse,
  toPreviousAppointmentSummary,
  toAppointmentSelectResponse,
  toIsoDateTime,
};
