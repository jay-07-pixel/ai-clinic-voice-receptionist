/**
 * Maps Branch / related records to API response shapes.
 */

const { DAY_OF_WEEK_ORDER, DEFAULT_TIMEZONE } = require('../dto/branchDto');

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

function formatAddress(branch) {
  if (!branch) {
    return null;
  }

  const parts = [
    branch.addressLine1,
    branch.addressLine2,
    branch.city,
    branch.state,
    branch.postalCode,
    branch.country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part) => typeof part === 'string' && part.length > 0);

  return parts.length > 0 ? parts.join(', ') : null;
}

function toAddressObject(branch) {
  if (!branch) {
    return null;
  }

  return {
    line1: branch.addressLine1 ?? null,
    line2: branch.addressLine2 ?? null,
    city: branch.city ?? null,
    state: branch.state ?? null,
    postalCode: branch.postalCode ?? null,
    country: branch.country ?? null,
    formatted: formatAddress(branch),
  };
}

function toClinicSummary(clinic) {
  if (!clinic) {
    return null;
  }

  return {
    id: clinic.id,
    name: clinic.name,
    code: clinic.code,
    phone: clinic.phone ?? null,
    email: clinic.email ?? null,
    timezone: clinic.timezone ?? DEFAULT_TIMEZONE,
  };
}

function compareHhMm(a, b) {
  return String(a).localeCompare(String(b));
}

/**
 * Collapse doctor schedules into branch business hours (earliest open / latest close per day).
 */
function toBusinessHours(schedules = []) {
  const byDay = new Map();

  for (const schedule of schedules) {
    if (!schedule?.dayOfWeek || !schedule.startTime || !schedule.endTime) {
      continue;
    }

    const current = byDay.get(schedule.dayOfWeek);
    if (!current) {
      byDay.set(schedule.dayOfWeek, {
        dayOfWeek: schedule.dayOfWeek,
        opensAt: schedule.startTime,
        closesAt: schedule.endTime,
      });
      continue;
    }

    if (compareHhMm(schedule.startTime, current.opensAt) < 0) {
      current.opensAt = schedule.startTime;
    }
    if (compareHhMm(schedule.endTime, current.closesAt) > 0) {
      current.closesAt = schedule.endTime;
    }
  }

  return DAY_OF_WEEK_ORDER.map((day) => byDay.get(day)).filter(Boolean);
}

function toBranchListItem(branch) {
  if (!branch) {
    return null;
  }

  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    phone: branch.phone ?? null,
    email: branch.clinic?.email ?? null,
    address: formatAddress(branch),
    city: branch.city ?? null,
    state: branch.state ?? null,
    timezone: branch.timezone ?? DEFAULT_TIMEZONE,
    active: Boolean(branch.isActive),
    doctorCount: branch._count?.doctorBranches ?? 0,
  };
}

function toBranchDetail(branch, businessHours = []) {
  if (!branch) {
    return null;
  }

  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    active: Boolean(branch.isActive),
    phone: branch.phone ?? null,
    email: branch.clinic?.email ?? null,
    timezone: branch.timezone ?? DEFAULT_TIMEZONE,
    address: toAddressObject(branch),
    clinic: toClinicSummary(branch.clinic),
    businessHours,
    createdAt: toIsoDateTime(branch.createdAt),
    updatedAt: toIsoDateTime(branch.updatedAt),
  };
}

function toBranchDoctorItem(link) {
  if (!link?.doctor) {
    return null;
  }

  const doctor = link.doctor;
  const departmentNames = [
    ...new Set(
      (doctor.doctorDepartments || [])
        .map((item) => item?.department?.name)
        .filter((name) => typeof name === 'string' && name.length > 0),
    ),
  ];

  return {
    id: doctor.id,
    displayName: doctor.displayName,
    title: doctor.title ?? null,
    departmentNames,
  };
}

function toBranchHoursResponse(branch, schedules = []) {
  return {
    timezone: branch?.timezone ?? DEFAULT_TIMEZONE,
    businessHours: toBusinessHours(schedules),
  };
}

module.exports = {
  toBranchListItem,
  toBranchDetail,
  toBranchDoctorItem,
  toBranchHoursResponse,
  toBusinessHours,
  formatAddress,
};
