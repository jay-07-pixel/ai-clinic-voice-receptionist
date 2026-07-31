const express = require('express');
const healthRoutes = require('./healthRoutes');
const patientRoutes = require('./patientRoutes');
const doctorRoutes = require('./doctorRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/api/v1/patients', patientRoutes);
router.use('/api/v1/doctors', doctorRoutes);

module.exports = router;
