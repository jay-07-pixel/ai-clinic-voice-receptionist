const express = require('express');
const healthRoutes = require('./healthRoutes');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');
const availabilityRoutes = require('./availabilityRoutes');
const appointmentRoutes = require('./appointmentRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/api/v1/patients', patientRoutes);
router.use('/api/v1/doctors', doctorRoutes);
router.use('/api/v1/availability', availabilityRoutes);
router.use('/api/v1/appointments', appointmentRoutes);

module.exports = router;
