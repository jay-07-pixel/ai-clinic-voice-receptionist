const express = require('express');
const patientController = require('../controllers/patientController');
const validateRequest = require('../middleware/validateRequest');
const {
  validateLookupPatient,
  validateCreatePatient,
  validateGetPatient,
  validateListPatientAppointments,
} = require('../validators/patientValidator');

const router = express.Router();

router.get('/lookup', validateRequest(validateLookupPatient), patientController.lookupPatient);

router.post('/', validateRequest(validateCreatePatient), patientController.createPatient);

router.get(
  '/:patientId/appointments',
  validateRequest(validateListPatientAppointments),
  patientController.listPatientAppointments,
);

router.get('/:patientId', validateRequest(validateGetPatient), patientController.getPatient);

module.exports = router;
