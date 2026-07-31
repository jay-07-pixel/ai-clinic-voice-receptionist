const express = require('express');
const clinikoController = require('../controllers/clinikoController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateProcessOrEnqueueSync,
  validateListSync,
  validateGetSync,
  validateClinikoWebhook,
} = require('../validators/clinikoValidator');

const router = express.Router();

router.post(
  '/sync',
  validateRequest(validateProcessOrEnqueueSync),
  clinikoController.postSync,
);

router.get(
  '/sync',
  validateRequest(validateListSync),
  clinikoController.listSync,
);

router.get(
  '/sync/:id',
  validateRequest(validateGetSync),
  clinikoController.getSync,
);

router.post(
  '/webhook',
  validateRequest(validateClinikoWebhook),
  clinikoController.handleWebhook,
);

module.exports = router;
