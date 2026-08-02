const asyncHandler = require('../utils/asyncHandler');
const PatientService = require('../services/patientService');

const patientService = new PatientService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const lookupPatient = asyncHandler(async (req, res) => {
  const result = await patientService.lookupPatient(req.validated);
  return sendSuccess(res, result);
});

const createPatient = asyncHandler(async (req, res) => {
  const result = await patientService.createPatient(req.validated);
  return sendSuccess(res, { patient: result.patient }, result.replayed ? 200 : 201);
});

const getPatient = asyncHandler(async (req, res) => {
  const patient = await patientService.getPatientById(req.validated.patientId);
  return sendSuccess(res, { patient });
});

const listPatientAppointments = asyncHandler(async (req, res) => {
  const { patientId, status, from, to, limit } = req.validated;
  const result = await patientService.listPatientAppointments(patientId, {
    status,
    from,
    to,
    limit,
  });
  return sendSuccess(res, result);
});

const findPatientAppointment = asyncHandler(async (req, res) => {
  const { patientId, appointmentId, doctorName } = req.validated;
  const result = await patientService.findPatientAppointment(patientId, {
    appointmentId,
    doctorName,
  });
  return sendSuccess(res, result);
});

module.exports = {
  lookupPatient,
  createPatient,
  getPatient,
  listPatientAppointments,
  findPatientAppointment,
};
