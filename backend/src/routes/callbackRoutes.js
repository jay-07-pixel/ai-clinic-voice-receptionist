const express = require('express');
const callbackController = require('../controllers/callbackController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateCreateCallback,
  validateListCallbacks,
  validateGetCallback,
  validateCompleteCallback,
  validateFailCallback,
} = require('../validators/callbackValidator');

const router = express.Router();

router.post('/', validateRequest(validateCreateCallback), callbackController.createCallback);

router.get('/', validateRequest(validateListCallbacks), callbackController.listCallbacks);

router.post(
  '/:callbackId/complete',
  validateRequest(validateCompleteCallback),
  callbackController.completeCallback,
);

router.post(
  '/:callbackId/fail',
  validateRequest(validateFailCallback),
  callbackController.failCallback,
);

router.get(
  '/:callbackId',
  validateRequest(validateGetCallback),
  callbackController.getCallback,
);

module.exports = router;
