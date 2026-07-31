const asyncHandler = require('../utils/asyncHandler');
const CallbackService = require('../services/callbackService');

const callbackService = new CallbackService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const createCallback = asyncHandler(async (req, res) => {
  const result = await callbackService.createCallback(req.validated);
  return sendSuccess(
    res,
    { callbackRequest: result.callback },
    result.replayed ? 200 : 201,
  );
});

const listCallbacks = asyncHandler(async (req, res) => {
  const result = await callbackService.listCallbacks(req.validated);
  return sendSuccess(res, result);
});

const getCallback = asyncHandler(async (req, res) => {
  const callback = await callbackService.getCallback(req.validated.callbackId);
  return sendSuccess(res, { callbackRequest: callback });
});

const completeCallback = asyncHandler(async (req, res) => {
  const result = await callbackService.completeCallback(req.validated);
  return sendSuccess(res, { callbackRequest: result.callback });
});

const failCallback = asyncHandler(async (req, res) => {
  const result = await callbackService.failCallback(req.validated);
  return sendSuccess(res, {
    callbackRequest: result.callback,
    retriesRemain: Boolean(result.retriesRemain),
  });
});

module.exports = {
  createCallback,
  listCallbacks,
  getCallback,
  completeCallback,
  failCallback,
};
