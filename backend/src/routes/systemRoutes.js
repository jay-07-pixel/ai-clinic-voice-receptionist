const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

router.get('/time', systemController.getTime);

module.exports = router;
