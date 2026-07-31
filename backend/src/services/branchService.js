const { AppError } = require('../middleware/errorHandler');
const BranchRepository = require('../repositories/branchRepository');
const {
  toBranchListItem,
  toBranchDetail,
  toBranchDoctorItem,
  toBranchHoursResponse,
  toBusinessHours,
} = require('../mappers/branchMapper');

class BranchService {
  /**
   * @param {BranchRepository} [branchRepository]
   */
  constructor(branchRepository = new BranchRepository()) {
    this.branchRepository = branchRepository;
  }

  async listBranches(filters = {}) {
    const { branches, total } = await this.branchRepository.findMany(filters);
    const items = branches.map(toBranchListItem).filter(Boolean);

    return {
      branches: items,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        count: items.length,
        hasMore: filters.offset + items.length < total,
      },
    };
  }

  async getBranchById(branchId) {
    const branch = await this.branchRepository.findById(branchId);

    if (!branch) {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    const schedules = await this.branchRepository.findActiveSchedules(branchId);

    return toBranchDetail(branch, toBusinessHours(schedules));
  }

  async listBranchDoctors(branchId, { limit, offset } = {}) {
    const branch = await this.branchRepository.findActiveSummary(branchId);

    if (!branch) {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    const { doctors, total } = await this.branchRepository.findDoctorsByBranchId(branchId, {
      limit,
      offset,
    });

    const items = doctors.map(toBranchDoctorItem).filter(Boolean);

    return {
      doctors: items,
      pagination: {
        total,
        limit,
        offset,
        count: items.length,
        hasMore: offset + items.length < total,
      },
    };
  }

  async getBranchHours(branchId) {
    const branch = await this.branchRepository.findActiveSummary(branchId);

    if (!branch) {
      throw new AppError('Branch not found', 404, { code: 'NOT_FOUND' });
    }

    const schedules = await this.branchRepository.findActiveSchedules(branchId);
    return toBranchHoursResponse(branch, schedules);
  }
}

module.exports = BranchService;
