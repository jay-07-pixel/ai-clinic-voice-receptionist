const express = require('express');
const healthRoutes = require('./healthRoutes');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');
const availabilityRoutes = require('./availabilityRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const branchRoutes = require('./branchRoutes');
const callSessionRoutes = require('./callSessionRoutes');
const callbackRoutes = require('./callbackRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/api/v1/patients', patientRoutes);
router.use('/api/v1/doctors', doctorRoutes);
router.use('/api/v1/availability', availabilityRoutes);
router.use('/api/v1/appointments', appointmentRoutes);
router.use('/api/v1/branches', branchRoutes);
router.use('/api/v1/call-sessions', callSessionRoutes);
router.use('/api/v1/callbacks', callbackRoutes);

module.exports = router;
