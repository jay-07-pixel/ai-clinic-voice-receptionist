const express = require('express');
const availabilityController = require('../controllers/availabilityController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateSearchAvailability,
  validateEarliestAvailability,
  validateHoldSlot,
  validateReleaseSlot,
} = require('../validators/availabilityValidator');

const router = express.Router();

router.get(
  '/earliest',
  validateRequest(validateEarliestAvailability),
  availabilityController.findEarliest,
);

router.post(
  '/slots/:slotId/hold',
  validateRequest(validateHoldSlot),
  availabilityController.holdSlot,
);

router.post(
  '/slots/:slotId/release',
  validateRequest(validateReleaseSlot),
  availabilityController.releaseSlot,
);

router.get('/', validateRequest(validateSearchAvailability), availabilityController.searchAvailability);

module.exports = router;
