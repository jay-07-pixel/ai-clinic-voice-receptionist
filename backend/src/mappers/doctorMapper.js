/**
 * Maps Prisma doctor / schedule records to API response shapes.
 */

const { DEFAULT_TIMEZONE } = require('../dto/doctorDto');

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

function toBranchSummary(branch) {
  if (!branch) {
    return null;
  }

  return {
    id: branch.id,
    name: branch.name,
  };
}

function toDepartmentSummary(department) {
  if (!department) {
    return null;
  }

  return {
    id: department.id,
    name: department.name,
  };
}

function toDoctorListItem(doctor) {
  if (!doctor) {
    return null;
  }

  const branches = (doctor.doctorBranches || [])
    .map((link) => toBranchSummary(link?.branch))
    .filter(Boolean);

  const departments = (doctor.doctorDepartments || [])
    .map((link) => toDepartmentSummary(link?.department))
    .filter(Boolean);

  return {
    id: doctor.id,
    displayName: doctor.displayName,
    firstName: doctor.firstName,
    lastName: doctor.lastName,
    title: doctor.title ?? null,
    departments,
    branches,
  };
}

function toDoctorDetail(doctor) {
  if (!doctor) {
    return null;
  }

  return {
    ...toDoctorListItem(doctor),
    email: doctor.email ?? null,
    phone: doctor.phone ?? null,
    isActive: Boolean(doctor.isActive),
    createdAt: toIsoDateTime(doctor.createdAt),
    updatedAt: toIsoDateTime(doctor.updatedAt),
  };
}

function toScheduleItem(schedule) {
  if (!schedule) {
    return null;
  }

  return {
    id: schedule.id,
    branchId: schedule.branchId,
    branchName: schedule.branch?.name ?? null,
    timezone: schedule.branch?.timezone ?? DEFAULT_TIMEZONE,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    slotDuration: schedule.slotDuration,
    effectiveFrom: toDateOnly(schedule.effectiveFrom),
    effectiveTo: toDateOnly(schedule.effectiveTo),
  };
}

function toExceptionItem(exception) {
  if (!exception) {
    return null;
  }

  return {
    id: exception.id,
    branchId: exception.branchId,
    branchName: exception.branch?.name ?? null,
    timezone: exception.branch?.timezone ?? DEFAULT_TIMEZONE,
    date: toDateOnly(exception.date),
    isDayOff: Boolean(exception.isDayOff),
    startTime: exception.startTime ?? null,
    endTime: exception.endTime ?? null,
    reason: exception.reason ?? null,
  };
}

module.exports = {
  toDoctorListItem,
  toDoctorDetail,
  toScheduleItem,
  toExceptionItem,
};
