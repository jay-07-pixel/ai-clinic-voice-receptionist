require('dotenv').config();

function parseNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || 'info',
  isProduction: process.env.NODE_ENV === 'production',
  /**
   * Minimum hours before appointment start required to allow reschedule.
   * 0 disables the reschedule policy check (useful for local/demo).
   */
  rescheduleWindowHours: parseNonNegativeInt(process.env.RESCHEDULE_WINDOW_HOURS, 24),
  retell: {
    apiKey: process.env.RETELL_API_KEY || '',
    skipSignatureVerify:
      process.env.RETELL_SKIP_SIGNATURE_VERIFY === 'true' ||
      (!process.env.RETELL_API_KEY && process.env.NODE_ENV !== 'production'),
  },
  cliniko: {
    apiKey: process.env.CLINIKO_API_KEY || '',
    baseUrl: process.env.CLINIKO_BASE_URL || '',
    timeoutMs: parseInt(process.env.CLINIKO_TIMEOUT, 10) || 15000,
    userAgent:
      process.env.CLINIKO_USER_AGENT ||
      'ClinicVoiceAI (ops@clinic-voice-ai.local)',
    defaultAppointmentTypeId: process.env.CLINIKO_DEFAULT_APPOINTMENT_TYPE_ID || '',
    webhookSecret: process.env.CLINIKO_WEBHOOK_SECRET || '',
    maxAttempts: parseInt(process.env.CLINIKO_MAX_ATTEMPTS, 10) || 5,
    batchSize: parseInt(process.env.CLINIKO_BATCH_SIZE, 10) || 20,
    maxRetries: parseInt(process.env.CLINIKO_HTTP_MAX_RETRIES, 10) || 3,
    baseBackoffMs: parseInt(process.env.CLINIKO_HTTP_BASE_BACKOFF_MS, 10) || 500,
    pollIntervalMs: parseInt(process.env.CLINIKO_POLL_INTERVAL_MS, 10) || 30000,
    dryRun: process.env.CLINIKO_DRY_RUN === 'true',
  },
};

module.exports = config;
