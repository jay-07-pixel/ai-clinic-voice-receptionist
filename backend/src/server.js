const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectDatabase, disconnectDatabase } = require('./config/database');

async function startServer() {
  try {
    await connectDatabase();

    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`, { env: config.env });
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received, shutting down gracefully`);

      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', { message: error.message });
    process.exit(1);
  }
}

startServer();
