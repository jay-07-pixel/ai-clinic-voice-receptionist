const asyncHandler = require('../utils/asyncHandler');
const AvailabilityService = require('../services/availabilityService');

const availabilityService = new AvailabilityService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const searchAvailability = asyncHandler(async (req, res) => {
  const result = await availabilityService.searchAvailability(req.validated);
  return sendSuccess(res, result);
});

const findEarliest = asyncHandler(async (req, res) => {
  const result = await availabilityService.findEarliest(req.validated);
  return sendSuccess(res, result);
});

const holdSlot = asyncHandler(async (req, res) => {
  const result = await availabilityService.holdSlot(req.validated);
  return sendSuccess(res, result);
});

const releaseSlot = asyncHandler(async (req, res) => {
  const result = await availabilityService.releaseSlot(req.validated);
  return sendSuccess(res, result);
});

module.exports = {
  searchAvailability,
  findEarliest,
  holdSlot,
  releaseSlot,
};
