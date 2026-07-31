/**
 * Maps AppointmentSlot records to availability API shapes.
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

function computeRemainingSeconds(holdExpiresAt, now = new Date()) {
  if (holdExpiresAt == null) {
    return 0;
  }

  const expiresAt = holdExpiresAt instanceof Date ? holdExpiresAt : new Date(holdExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

function toDepartmentNames(doctor) {
  const links = doctor?.doctorDepartments || [];
  const names = links
    .map((link) => link?.department?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);

  return [...new Set(names)];
}

function toSlotEnrichment(slot) {
  return {
    doctorName: slot.doctor?.displayName ?? null,
    branchName: slot.branch?.name ?? null,
    departmentNames: toDepartmentNames(slot.doctor),
    timezone: slot.branch?.timezone ?? null,
  };
}

function toSlotListItem(slot) {
  if (!slot) {
    return null;
  }

  return {
    id: slot.id,
    doctorId: slot.doctorId,
    branchId: slot.branchId,
    ...toSlotEnrichment(slot),
    startsAt: toIsoDateTime(slot.startsAt),
    endsAt: toIsoDateTime(slot.endsAt),
    status: 'AVAILABLE',
    bufferAfterMinutes: slot.bufferAfterMinutes,
    remainingSeconds: null,
  };
}

function toEarliestSlot(slot) {
  if (!slot) {
    return null;
  }

  return {
    id: slot.id,
    branchId: slot.branchId,
    doctorId: slot.doctorId,
    ...toSlotEnrichment(slot),
    startsAt: toIsoDateTime(slot.startsAt),
    endsAt: toIsoDateTime(slot.endsAt),
    remainingSeconds: null,
  };
}

function toHoldResponse(slot, now = new Date()) {
  if (!slot) {
    return null;
  }

  const holdExpiresAt = toIsoDateTime(slot.holdExpiresAt);

  return {
    slotId: slot.id,
    status: slot.status,
    holdExpiresAt,
    remainingSeconds: computeRemainingSeconds(slot.holdExpiresAt, now),
    doctorId: slot.doctorId ?? null,
    branchId: slot.branchId ?? null,
    ...toSlotEnrichment(slot),
  };
}

function toReleaseResponse(slot) {
  if (!slot) {
    return null;
  }

  return {
    slotId: slot.id,
    status: slot.status,
    remainingSeconds: 0,
  };
}

module.exports = {
  toSlotListItem,
  toEarliestSlot,
  toHoldResponse,
  toReleaseResponse,
  computeRemainingSeconds,
  toIsoDateTime,
};
