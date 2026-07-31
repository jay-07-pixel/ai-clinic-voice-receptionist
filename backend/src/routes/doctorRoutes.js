const express = require('express');
const doctorController = require('../controllers/doctorController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateListDoctors,
  validateGetDoctor,
  validateGetDoctorSchedule,
} = require('../validators/doctorValidator');

const router = express.Router();

router.get('/', validateRequest(validateListDoctors), doctorController.listDoctors);

router.get(
  '/:doctorId/schedule',
  validateRequest(validateGetDoctorSchedule),
  doctorController.getDoctorSchedule,
);

router.get('/:doctorId', validateRequest(validateGetDoctor), doctorController.getDoctor);

module.exports = router;
