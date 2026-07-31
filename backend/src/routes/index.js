const express = require('express');
const healthRoutes = require('./healthRoutes');
const patientRoutes = require('./patientRoutes');

const router = express.Router();

router.use('/health', healthRoutes);
router.use('/api/v1/patients', patientRoutes);

module.exports = router;
