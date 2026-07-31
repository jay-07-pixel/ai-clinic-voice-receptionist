const { PrismaClient } = require('@prisma/client');
const config = require('./index');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  log:
    process.env.NODE_ENV === 'development'
      ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }]
      : [{ emit: 'stdout', level: 'error' }],
});

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (event) => {
    logger.debug('Prisma query', { query: event.query, duration: `${event.duration}ms` });
  });
}

async function connectDatabase() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
  } catch (error) {
    if (config.isProduction) {
      throw error;
    }
    logger.warn('Database connection failed — server starting without DB', {
      message: error.message,
    });
  }
}

async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase,
};
