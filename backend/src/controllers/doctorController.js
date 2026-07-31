const asyncHandler = require('../utils/asyncHandler');
const DoctorService = require('../services/doctorService');

const doctorService = new DoctorService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const listDoctors = asyncHandler(async (req, res) => {
  const result = await doctorService.listDoctors(req.validated);
  return sendSuccess(res, result);
});

const getDoctor = asyncHandler(async (req, res) => {
  const doctor = await doctorService.getDoctorById(req.validated.doctorId);
  return sendSuccess(res, { doctor });
});

const getDoctorSchedule = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctorSchedule(req.validated.doctorId, {
    branchId: req.validated.branchId,
    from: req.validated.from,
    to: req.validated.to,
  });
  return sendSuccess(res, result);
});

module.exports = {
  listDoctors,
  getDoctor,
  getDoctorSchedule,
};
