const express = require('express');
const appointmentController = require('../controllers/appointmentController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateBookAppointment,
  validateGetAppointment,
  validateRescheduleAppointment,
  validateCancelAppointment,
  validateSelectAppointment,
} = require('../validators/appointmentValidator');

const router = express.Router();

router.post(
  '/select',
  validateRequest(validateSelectAppointment),
  appointmentController.selectAppointment,
);

router.post('/', validateRequest(validateBookAppointment), appointmentController.bookAppointment);

router.post(
  '/reschedule',
  validateRequest(validateRescheduleAppointment),
  appointmentController.rescheduleAppointment,
);

router.post(
  '/:appointmentId/reschedule',
  validateRequest(validateRescheduleAppointment),
  appointmentController.rescheduleAppointment,
);

router.post(
  '/:appointmentId/cancel',
  validateRequest(validateCancelAppointment),
  appointmentController.cancelAppointment,
);

router.get(
  '/:appointmentId',
  validateRequest(validateGetAppointment),
  appointmentController.getAppointment,
);

module.exports = router;
