const asyncHandler = require('../utils/asyncHandler');
const AppointmentService = require('../services/appointmentService');

const appointmentService = new AppointmentService();

function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

const bookAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.bookAppointment(req.validated);
  return sendSuccess(
    res,
    { appointment: result.appointment },
    result.replayed ? 200 : 201,
  );
});

const getAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.getAppointmentById(req.validated.appointmentId);
  return sendSuccess(res, { appointment });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  console.log('=== RESCHEDULE REQUEST ===');
  console.log('req.params:', req.params);
  console.log('req.body:', req.body);
  console.log('req.validated:', req.validated);

  const result = await appointmentService.rescheduleAppointment(req.validated);
  return sendSuccess(res, {
    previousAppointment: result.previousAppointment,
    appointment: result.appointment,
  });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.cancelAppointment(req.validated);
  return sendSuccess(res, { appointment: result.appointment });
});

const selectAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.selectAppointment(req.validated);
  return res.status(200).json({
    success: true,
    ...appointment,
  });
});

module.exports = {
  bookAppointment,
  getAppointment,
  rescheduleAppointment,
  cancelAppointment,
  selectAppointment,
};
