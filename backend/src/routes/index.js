const express = require('express');
const healthRoutes = require('./healthRoutes');

const router = express.Router();

router.use('/health', healthRoutes);

// Future API routes will be mounted under /api
// router.use('/api', apiRoutes);

module.exports = router;
