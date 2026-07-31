const logger = require('../../utils/logger');
const config = require('../../config');
const ClinikoSyncService = require('./clinikoSyncService');
const { DEFAULT_BATCH_SIZE } = require('../../dto/clinikoDto');

/**
 * Background worker that polls ClinikoSync PENDING rows.
 * Safe for multiple overlapping executions via conditional claim.
 */
class ClinikoWorker {
  /**
   * @param {object} [deps]
   */
  constructor({
    syncService = new ClinikoSyncService(),
    batchSize = config.cliniko?.batchSize || DEFAULT_BATCH_SIZE,
    pollIntervalMs = config.cliniko?.pollIntervalMs || 30_000,
  } = {}) {
    this.syncService = syncService;
    this.batchSize = batchSize;
    this.pollIntervalMs = pollIntervalMs;
    this.running = false;
    this.timer = null;
    this.inFlight = false;
  }

  /**
   * Run a single poll/process cycle.
   */
  async runOnce({ limit } = {}) {
    if (this.inFlight) {
      logger.warn('Cliniko worker skipped overlapping run');
      return { skipped: true, reason: 'in_flight' };
    }

    this.inFlight = true;
    try {
      return await this.syncService.processPending({
        limit: limit || this.batchSize,
      });
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Start interval polling (optional long-running mode).
   */
  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    logger.info('Cliniko worker started', {
      batchSize: this.batchSize,
      pollIntervalMs: this.pollIntervalMs,
    });

    const tick = async () => {
      if (!this.running) {
        return;
      }
      try {
        await this.runOnce();
      } catch (error) {
        logger.error('Cliniko worker tick failed', {
          message: error?.message,
        });
      }
    };

    // Fire immediately, then on interval.
    tick();
    this.timer = setInterval(tick, this.pollIntervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Cliniko worker stopped');
  }
}

module.exports = ClinikoWorker;
