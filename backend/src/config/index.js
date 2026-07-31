require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  isProduction: process.env.NODE_ENV === 'production',
  retell: {
    apiKey: process.env.RETELL_API_KEY || '',
    skipSignatureVerify:
      process.env.RETELL_SKIP_SIGNATURE_VERIFY === 'true' ||
      (!process.env.RETELL_API_KEY && process.env.NODE_ENV !== 'production'),
  },
};

module.exports = config;
