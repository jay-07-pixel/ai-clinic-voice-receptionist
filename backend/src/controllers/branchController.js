const asyncHandler = require('../utils/asyncHandler');
const BranchService = require('../services/branchService');

const branchService = new BranchService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const listBranches = asyncHandler(async (req, res) => {
  const result = await branchService.listBranches(req.validated);
  return sendSuccess(res, result);
});

const getBranch = asyncHandler(async (req, res) => {
  const branch = await branchService.getBranchById(req.validated.branchId);
  return sendSuccess(res, { branch });
});

const listBranchDoctors = asyncHandler(async (req, res) => {
  const { branchId, limit, offset } = req.validated;
  const result = await branchService.listBranchDoctors(branchId, { limit, offset });
  return sendSuccess(res, result);
});

const getBranchHours = asyncHandler(async (req, res) => {
  const result = await branchService.getBranchHours(req.validated.branchId);
  return sendSuccess(res, result);
});

module.exports = {
  listBranches,
  getBranch,
  listBranchDoctors,
  getBranchHours,
};
