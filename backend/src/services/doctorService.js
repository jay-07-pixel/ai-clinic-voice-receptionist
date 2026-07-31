const {
  SCHEDULE_DEFAULT_RANGE_DAYS,
  DEFAULT_TIMEZONE,
} = require('../dto/doctorDto');
const { AppError } = require('../middleware/errorHandler');
const DoctorRepository = require('../repositories/doctorRepository');
const {
  toDoctorListItem,
  toDoctorDetail,
  toScheduleItem,
  toExceptionItem,
} = require('../mappers/doctorMapper');

class DoctorService {
  /**
   * @param {DoctorRepository} [doctorRepository]
   */
  constructor(doctorRepository = new DoctorRepository()) {
    this.doctorRepository = doctorRepository;
  }

  async listDoctors({ branchId, departmentId, q, limit, offset } = {}) {
    const { doctors, total } = await this.doctorRepository.findMany({
      branchId,
      departmentId,
      q,
      limit,
      offset,
    });

    const items = doctors.map(toDoctorListItem).filter(Boolean);
    const count = items.length;

    return {
      doctors: items,
      pagination: {
        total,
        limit,
        offset,
        count,
        hasMore: offset + count < total,
      },
    };
  }

  async getDoctorById(doctorId) {
    const doctor = await this.doctorRepository.findById(doctorId);

    if (!doctor) {
      throw new AppError('Doctor not found', 404, { code: 'NOT_FOUND' });
    }

    return toDoctorDetail(doctor);
  }

  async getDoctorSchedule(doctorId, { branchId, from, to } = {}) {
    const range = this.#resolveScheduleRange(from, to);

    const [exists, branch, schedules, exceptions] = await Promise.all([
      this.doctorRepository.existsActive(doctorId),
      branchId
        ? this.doctorRepository.findActiveBranchTimezone(branchId)
        : Promise.resolve(null),
      this.doctorRepository.findSchedules(doctorId, {
        branchId,
        from: range.from,
        to: range.to,
      }),
      this.doctorRepository.findScheduleExceptions(doctorId, {
        branchId,
        from: range.from,
        to: range.to,
      }),
    ]);

    if (!exists) {
      throw new AppError('Doctor not found', 404, { code: 'NOT_FOUND' });
    }

    if (branchId && !branch) {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    const mappedSchedules = schedules.map(toScheduleItem).filter(Boolean);
    const mappedExceptions = exceptions.map(toExceptionItem).filter(Boolean);
    const timezone = this.#resolveTimezone(branch, mappedSchedules, mappedExceptions);

    return {
      doctorId,
      branchId: branchId || null,
      timezone,
      from: range.from,
      to: range.to,
      schedules: mappedSchedules,
      exceptions: mappedExceptions,
    };
  }

  #resolveScheduleRange(from, to) {
    if (from && to) {
      return { from, to };
    }

    const start = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

    const end = to
      ? new Date(`${to}T00:00:00.000Z`)
      : new Date(start.getTime() + SCHEDULE_DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);

    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
    };
  }

  #resolveTimezone(branch, schedules, exceptions) {
    if (branch?.timezone) {
      return branch.timezone;
    }

    const zones = new Set(
      [...schedules, ...exceptions]
        .map((item) => item.timezone)
        .filter((zone) => typeof zone === 'string' && zone.length > 0),
    );

    if (zones.size === 1) {
      return zones.values().next().value;
    }

    if (zones.size === 0) {
      return DEFAULT_TIMEZONE;
    }

    return null;
  }
}

module.exports = DoctorService;
