const { prisma } = require('../config/database');

const ACTIVE_DOCTOR = Object.freeze({
  deletedAt: null,
  isActive: true,
});

const ACTIVE_BRANCH = Object.freeze({
  deletedAt: null,
  isActive: true,
});

const ACTIVE_BRANCH_LINK = Object.freeze({
  isActive: true,
  branch: {
    is: { ...ACTIVE_BRANCH },
  },
});

const ACTIVE_DEPARTMENT_LINK = Object.freeze({
  isActive: true,
  department: {
    is: {
      isActive: true,
    },
  },
});

const BRANCH_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
});

const BRANCH_TIMEZONE_SELECT = Object.freeze({
  id: true,
  name: true,
  timezone: true,
});

const DEPARTMENT_SUMMARY_SELECT = Object.freeze({
  id: true,
  name: true,
});

const DOCTOR_LIST_SELECT = Object.freeze({
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  title: true,
  doctorBranches: {
    where: ACTIVE_BRANCH_LINK,
    select: {
      branch: { select: BRANCH_SUMMARY_SELECT },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
  doctorDepartments: {
    where: ACTIVE_DEPARTMENT_LINK,
    select: {
      department: { select: DEPARTMENT_SUMMARY_SELECT },
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  },
});

const DOCTOR_DETAIL_SELECT = Object.freeze({
  ...DOCTOR_LIST_SELECT,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
});

const SCHEDULE_SELECT = Object.freeze({
  id: true,
  branchId: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  slotDuration: true,
  effectiveFrom: true,
  effectiveTo: true,
  branch: { select: BRANCH_TIMEZONE_SELECT },
});

const EXCEPTION_SELECT = Object.freeze({
  id: true,
  branchId: true,
  date: true,
  isDayOff: true,
  startTime: true,
  endTime: true,
  reason: true,
  branch: { select: BRANCH_TIMEZONE_SELECT },
});

class DoctorRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #buildListWhere({ branchId, departmentId, q } = {}) {
    const where = {
      ...ACTIVE_DOCTOR,
    };

    const andFilters = [];

    if (branchId) {
      andFilters.push({
        doctorBranches: {
          some: {
            branchId,
            ...ACTIVE_BRANCH_LINK,
          },
        },
      });
    }

    if (departmentId) {
      andFilters.push({
        doctorDepartments: {
          some: {
            departmentId,
            ...ACTIVE_DEPARTMENT_LINK,
          },
        },
      });
    }

    if (q) {
      andFilters.push({
        OR: [
          { displayName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    return where;
  }

  async findMany({ branchId, departmentId, q, limit = 50, offset = 0 } = {}) {
    const where = this.#buildListWhere({ branchId, departmentId, q });

    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        select: DOCTOR_LIST_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.doctor.count({ where }),
    ]);

    return { doctors, total };
  }

  async findById(doctorId) {
    if (!doctorId) {
      return null;
    }

    return this.prisma.doctor.findFirst({
      where: {
        id: doctorId,
        ...ACTIVE_DOCTOR,
      },
      select: DOCTOR_DETAIL_SELECT,
    });
  }

  async existsActive(doctorId) {
    if (!doctorId) {
      return false;
    }

    const doctor = await this.prisma.doctor.findFirst({
      where: {
        id: doctorId,
        ...ACTIVE_DOCTOR,
      },
      select: { id: true },
    });

    return Boolean(doctor);
  }

  async findActiveBranchTimezone(branchId) {
    if (!branchId) {
      return null;
    }

    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        ...ACTIVE_BRANCH,
      },
      select: BRANCH_TIMEZONE_SELECT,
    });
  }

  async findSchedules(doctorId, { branchId, from, to } = {}) {
    if (!doctorId) {
      return [];
    }

    const where = {
      doctorId,
      isActive: true,
      branch: { ...ACTIVE_BRANCH },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (from || to) {
      const rangeFilters = [];

      if (from) {
        rangeFilters.push({
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${from}T00:00:00.000Z`) } }],
        });
      }

      if (to) {
        rangeFilters.push({
          OR: [
            { effectiveFrom: null },
            { effectiveFrom: { lte: new Date(`${to}T23:59:59.999Z`) } },
          ],
        });
      }

      where.AND = rangeFilters;
    }

    return this.prisma.doctorSchedule.findMany({
      where,
      select: SCHEDULE_SELECT,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findScheduleExceptions(doctorId, { branchId, from, to } = {}) {
    if (!doctorId) {
      return [];
    }

    const where = {
      doctorId,
      branch: { ...ACTIVE_BRANCH },
    };

    if (branchId) {
      where.branchId = branchId;
    }

    if (from || to) {
      where.date = {};
      if (from) {
        where.date.gte = new Date(`${from}T00:00:00.000Z`);
      }
      if (to) {
        where.date.lte = new Date(`${to}T00:00:00.000Z`);
      }
    }

    return this.prisma.doctorScheduleException.findMany({
      where,
      select: EXCEPTION_SELECT,
      orderBy: [{ date: 'asc' }],
    });
  }
}

module.exports = DoctorRepository;
