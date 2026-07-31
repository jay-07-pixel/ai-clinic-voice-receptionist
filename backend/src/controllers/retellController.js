const asyncHandler = require('../utils/asyncHandler');
const RetellWebhookService = require('../integrations/retell/retellWebhookService');

const retellWebhookService = new RetellWebhookService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const handleWebhook = asyncHandler(async (req, res) => {
  const result = await retellWebhookService.handleEvent(req.validated || req.body);
  return sendSuccess(res, result);
});

module.exports = {
  handleWebhook,
};
