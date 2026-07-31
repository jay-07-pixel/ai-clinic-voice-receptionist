const express = require('express');
const callSessionController = require('../controllers/callSessionController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateCreateCallSession,
  validateGetCallSession,
  validateResumeCallSession,
  validateEndCallSession,
} = require('../validators/callSessionValidator');

const router = express.Router();

router.post('/', validateRequest(validateCreateCallSession), callSessionController.createCallSession);

router.post(
  '/:sessionId/resume',
  validateRequest(validateResumeCallSession),
  callSessionController.resumeCallSession,
);

router.post(
  '/:sessionId/end',
  validateRequest(validateEndCallSession),
  callSessionController.endCallSession,
);

router.get(
  '/:sessionId',
  validateRequest(validateGetCallSession),
  callSessionController.getCallSession,
);

module.exports = router;
