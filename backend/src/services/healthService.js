const config = require('../config');

async function getHealthStatus() {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
  };
}

module.exports = {
  getHealthStatus,
};
