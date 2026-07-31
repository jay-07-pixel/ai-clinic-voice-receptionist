const { prisma } = require('../config/database');

const NOT_DELETED = Object.freeze({ deletedAt: null });

const ACTIVE_DOCTOR_ASSIGNMENT = Object.freeze({
  isActive: true,
  doctor: {
    is: {
      isActive: true,
      deletedAt: null,
    },
  },
});

const CLINIC_SELECT = Object.freeze({
  id: true,
  name: true,
  code: true,
  phone: true,
  email: true,
  timezone: true,
});

const BRANCH_LIST_SELECT = Object.freeze({
  id: true,
  name: true,
  code: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  timezone: true,
  isActive: true,
  clinic: {
    select: {
      email: true,
    },
  },
  _count: {
    select: {
      doctorBranches: {
        where: ACTIVE_DOCTOR_ASSIGNMENT,
      },
    },
  },
});

const BRANCH_DETAIL_SELECT = Object.freeze({
  id: true,
  name: true,
  code: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  timezone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  clinic: {
    select: CLINIC_SELECT,
  },
});

const BRANCH_EXISTS_SELECT = Object.freeze({
  id: true,
  timezone: true,
  isActive: true,
});

const SCHEDULE_SELECT = Object.freeze({
  dayOfWeek: true,
  startTime: true,
  endTime: true,
});

const BRANCH_DOCTOR_SELECT = Object.freeze({
  doctor: {
    select: {
      id: true,
      displayName: true,
      title: true,
      doctorDepartments: {
        where: {
          isActive: true,
          department: {
            is: { isActive: true },
          },
        },
        select: {
          department: {
            select: { name: true },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
  },
});

class BranchRepository {
  /**
   * @param {import('@prisma/client').PrismaClient} [client]
   */
  constructor(client = prisma) {
    this.prisma = client;
  }

  #buildListWhere({ clinicId, q, activeOnly = true } = {}) {
    const where = {
      ...NOT_DELETED,
    };

    if (activeOnly) {
      where.isActive = true;
    }

    if (clinicId) {
      where.clinicId = clinicId;
    }

    if (q) {
      where.name = { contains: q, mode: 'insensitive' };
    }

    return where;
  }

  async findMany({ clinicId, q, activeOnly = true, limit = 50, offset = 0 } = {}) {
    const where = this.#buildListWhere({ clinicId, q, activeOnly });

    const [branches, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        select: BRANCH_LIST_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.branch.count({ where }),
    ]);

    return { branches, total };
  }

  async findById(branchId) {
    if (!branchId) {
      return null;
    }

    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        ...NOT_DELETED,
        isActive: true,
      },
      select: BRANCH_DETAIL_SELECT,
    });
  }

  async findActiveSummary(branchId) {
    if (!branchId) {
      return null;
    }

    return this.prisma.branch.findFirst({
      where: {
        id: branchId,
        ...NOT_DELETED,
        isActive: true,
      },
      select: BRANCH_EXISTS_SELECT,
    });
  }

  async findActiveSchedules(branchId) {
    if (!branchId) {
      return [];
    }

    return this.prisma.doctorSchedule.findMany({
      where: {
        branchId,
        isActive: true,
        doctor: {
          isActive: true,
          deletedAt: null,
        },
      },
      select: SCHEDULE_SELECT,
    });
  }

  async findDoctorsByBranchId(branchId, { limit = 50, offset = 0 } = {}) {
    if (!branchId) {
      return { doctors: [], total: 0 };
    }

    const where = {
      branchId,
      ...ACTIVE_DOCTOR_ASSIGNMENT,
    };

    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctorBranch.findMany({
        where,
        select: BRANCH_DOCTOR_SELECT,
        orderBy: [
          { isPrimary: 'desc' },
          { doctor: { lastName: 'asc' } },
          { doctor: { firstName: 'asc' } },
        ],
        take: limit,
        skip: offset,
      }),
      this.prisma.doctorBranch.count({ where }),
    ]);

    return { doctors, total };
  }
}

module.exports = BranchRepository;
