const express = require('express');
const retellController = require('../controllers/retellController');
const validateRequest = require('../middleware/validateRequest');
const verifyRetellWebhook = require('../middleware/verifyRetellSignature');
const { validateRetellWebhook } = require('../validators/retellValidator');

const router = express.Router();

router.post(
  '/webhook',
  verifyRetellWebhook,
  validateRequest(validateRetellWebhook),
  retellController.handleWebhook,
);

module.exports = router;
