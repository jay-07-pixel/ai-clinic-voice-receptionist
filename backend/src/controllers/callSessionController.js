const asyncHandler = require('../utils/asyncHandler');
const CallSessionService = require('../services/callSessionService');

const callSessionService = new CallSessionService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const createCallSession = asyncHandler(async (req, res) => {
  const result = await callSessionService.createSession(req.validated);
  return sendSuccess(
    res,
    { callSession: result.callSession },
    result.replayed ? 200 : 201,
  );
});

const getCallSession = asyncHandler(async (req, res) => {
  const callSession = await callSessionService.getSession(req.validated.sessionId);
  return sendSuccess(res, { callSession });
});

const resumeCallSession = asyncHandler(async (req, res) => {
  const result = await callSessionService.resumeSession(req.validated);
  return sendSuccess(res, { callSession: result.callSession });
});

const endCallSession = asyncHandler(async (req, res) => {
  const result = await callSessionService.endSession(req.validated);
  return sendSuccess(res, {
    callSession: result.callSession,
    releasedHoldCount: result.releasedHoldCount ?? 0,
  });
});

module.exports = {
  createCallSession,
  getCallSession,
  resumeCallSession,
  endCallSession,
};
