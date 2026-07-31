const healthService = require('../services/healthService');

async function getHealth(req, res) {
  const health = await healthService.getHealthStatus();
  res.status(200).json(health);
}

module.exports = {
  getHealth,
};
