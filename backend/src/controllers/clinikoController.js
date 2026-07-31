const asyncHandler = require('../utils/asyncHandler');
const ClinikoSyncService = require('../integrations/cliniko/clinikoSyncService');
const ClinikoWorker = require('../integrations/cliniko/clinikoWorker');
const ClinikoWebhookService = require('../integrations/cliniko/clinikoWebhookService');

const clinikoSyncService = new ClinikoSyncService();
const clinikoWorker = new ClinikoWorker({ syncService: clinikoSyncService });
const clinikoWebhookService = new ClinikoWebhookService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const postSync = asyncHandler(async (req, res) => {
  const dto = req.validated;

  if (dto.mode === 'enqueue') {
    const result = await clinikoSyncService.enqueueSync(dto);
    return sendSuccess(res, result, 202);
  }

  const result = await clinikoWorker.runOnce({ limit: dto.limit });
  return sendSuccess(res, result, 200);
});

const listSync = asyncHandler(async (req, res) => {
  const result = await clinikoSyncService.listSyncJobs(req.validated);
  return sendSuccess(res, result);
});

const getSync = asyncHandler(async (req, res) => {
  const clinikoSync = await clinikoSyncService.getSyncJob(req.validated.id);
  return sendSuccess(res, { clinikoSync });
});

const handleWebhook = asyncHandler(async (req, res) => {
  const signature =
    req.headers['x-cliniko-signature'] ||
    req.headers['x-webhook-signature'] ||
    req.headers['x-signature'];

  const result = await clinikoWebhookService.handleEvent(req.validated || req.body, {
    rawBody: req.rawBody,
    signature,
  });

  return sendSuccess(res, result, 202);
});

module.exports = {
  postSync,
  listSync,
  getSync,
  handleWebhook,
};
