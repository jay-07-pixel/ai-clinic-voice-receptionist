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

module.exports = {
  bookAppointment,
  getAppointment,
  rescheduleAppointment,
  cancelAppointment,
};
